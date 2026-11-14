// All Firestore writes live here so pages stay simple.
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocsFromServer,
  increment,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { OWNER_EMAIL } from './config';
import { toDate, overlaps, HOUR, fmtDateTime, fmtTime } from './time';
import { bookingIsLive, bookingIsNoShow, DEFAULT_MAX_BOOKING_HOURS } from './status';

const ts = (d) => Timestamp.fromDate(toDate(d));
const cleanParams = (params = []) =>
  params
    .map((p) => ({ key: String(p.key || '').trim(), value: String(p.value || '').trim() }))
    .filter((p) => p.key || p.value)
    .slice(0, 40);

// ── Users / access ───────────────────────────────────────────────────────────

/**
 * Called after every Google sign-in. Creates the profile on first login and
 * picks up allowlist changes. The security rules re-check everything here.
 */
export async function ensureUserProfile(fbUser, allowedDomain) {
  const email = (fbUser.email || '').toLowerCase();
  const ref = doc(db, 'users', fbUser.uid);
  const snap = await getDoc(ref);
  const cur = snap.exists() ? snap.data() : null;

  // Approved returning users: nothing to look up. Only touch the profile when something changed or the
  // last-login stamp is a few hours old, so ordinary page loads cost no writes at all.
  if (cur?.approved) {
    const name = fbUser.displayName || cur.name;
    const photoURL = fbUser.photoURL || cur.photoURL || '';
    const stale = !toDate(cur.lastLoginAt) || Date.now() - toDate(cur.lastLoginAt) > 6 * HOUR;
    if (stale || name !== cur.name || photoURL !== cur.photoURL) {
      await updateDoc(ref, { lastLoginAt: serverTimestamp(), name, photoURL }).catch(() => {});
    }
    return;
  }

  let listed = null;
  try {
    const a = await getDoc(doc(db, 'allowlist', email));
    if (a.exists()) listed = a.data();
  } catch {
    /* not readable → not listed */
  }
  const domainOk = allowedDomain && email.endsWith('@' + allowedDomain.toLowerCase()) && fbUser.emailVerified;

  const access = email === OWNER_EMAIL
    ? { role: 'admin', approved: true }
    : listed
    ? { role: listed.role, approved: true }
    : domainOk
      ? { role: 'member', approved: true }
      : { role: 'guest', approved: false };

  if (!cur) {
    const profile = {
      uid: fbUser.uid,
      email,
      name: fbUser.displayName || email,
      photoURL: fbUser.photoURL || '',
      trainedOn: [],
      notify: true,
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
      ...access,
    };
    try {
      await setDoc(ref, profile);
    } catch (e) {
      // Domain check in rules differs from VITE_ALLOWED_DOMAIN → fall back to pending.
      await setDoc(ref, { ...profile, role: 'guest', approved: false });
    }
    return;
  }

  const patch = { lastLoginAt: serverTimestamp(), name: fbUser.displayName || cur.name, photoURL: fbUser.photoURL || cur.photoURL || '' };
  if (access.approved) Object.assign(patch, access);
  try {
    await updateDoc(ref, patch);
  } catch {
    await updateDoc(ref, { lastLoginAt: serverTimestamp() }).catch(() => {});
  }
}

export function updateUser(uid, patch) {
  return updateDoc(doc(db, 'users', uid), patch);
}
export function deleteUser(uid) {
  return deleteDoc(doc(db, 'users', uid));
}
export function addToAllowlist(email, role, by) {
  return setDoc(doc(db, 'allowlist', email.trim().toLowerCase()), { role, addedBy: by, addedAt: serverTimestamp() });
}
export function removeFromAllowlist(email) {
  return deleteDoc(doc(db, 'allowlist', email));
}

// ── Sessions ─────────────────────────────────────────────────────────────────

export function canUseInstrument(inst, profile) {
  if (!profile) return false;
  if (!['member', 'admin'].includes(profile.role)) return false;
  if (inst.status === 'out_of_service') return false;
  if (inst.restricted && !(profile.trainedOn || []).includes(inst.id) && profile.role !== 'admin') return false;
  return true;
}

export async function startSession({ instrument, profile, sample, params, comments, expectedEnd, bookings = [] }) {
  if (!canUseInstrument(instrument, profile)) {
    throw new Error(
      instrument.restricted ? 'This instrument needs training approval. Ask an admin to approve you.' : 'You are not allowed to start sessions.',
    );
  }
  const now = new Date();
  // A booking by someone else that covers right now blocks the start.
  const live = bookings.filter((b) => b.instrumentId === instrument.id && b.status === 'booked' && bookingIsLive(b, now));
  const blocking = live.find((b) => b.userId !== profile.uid && toDate(b.start) <= now && toDate(b.end) > now);
  if (blocking) {
    throw new Error(`Reserved by ${blocking.userName} until ${fmtTime(blocking.end)}.`);
  }
  const mine = live.find((b) => b.userId === profile.uid && toDate(b.start).getTime() - now.getTime() < 30 * 60 * 1000 && toDate(b.end) > now);

  const instRef = doc(db, 'instruments', instrument.id);
  const sessRef = doc(collection(db, 'sessions'));

  const run = (withSchedule) => runTransaction(db, async (tx) => {
    const [fresh, sched] = await Promise.all([tx.get(instRef), withSchedule ? tx.get(schedRef(instrument.id)) : null]);
    if (!fresh.exists()) throw new Error('Instrument not found.');
    const d = fresh.data();
    if (d.status === 'out_of_service') throw new Error('Instrument is out of service.');
    if (d.activeSession) throw new Error('Someone just started a session on this instrument.');
    // Re-check reservations against the server copy, not the possibly-stale list on screen.
    for (const [id, e] of Object.entries(sched?.exists() ? sched.data().b || {} : {})) {
      if (e.uid === profile.uid || !(toDate(e.s) <= now && toDate(e.e) > now)) continue;
      const b = await tx.get(doc(db, 'bookings', id));
      if (b.exists() && b.data().status === 'booked' && bookingIsLive(b.data(), now)) {
        throw new Error(`Reserved by ${b.data().userName} until ${fmtTime(b.data().end)}.`);
      }
    }

    tx.set(sessRef, {
      instrumentId: instrument.id,
      instrumentName: instrument.name,
      userId: profile.uid,
      userName: profile.name,
      userPhoto: profile.photoURL || '',
      sample: String(sample || '').trim().slice(0, 200),
      params: cleanParams(params),
      comments: String(comments || '').trim().slice(0, 2000),
      startedAt: serverTimestamp(),
      expectedEnd: ts(expectedEnd),
      endedAt: null,
      status: 'active',
      bookingId: mine ? mine.id : null,
      extendedCount: 0,
    });
    tx.update(instRef, { activeSession: { sessionId: sessRef.id, uid: profile.uid } });
    if (mine) {
      tx.update(doc(db, 'bookings', mine.id), { status: 'started', sessionId: sessRef.id, startedAt: serverTimestamp() });
    }
  });
  await withScheduleFallback(() => run(true), () => run(false));
  return sessRef.id;
}

export async function finishSession(session) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'sessions', session.id), { status: 'finished', endedAt: serverTimestamp() });
  batch.update(doc(db, 'instruments', session.instrumentId), { activeSession: null, freeSince: serverTimestamp() });
  await batch.commit();
}

export function extendSession(session, newEnd) {
  return updateDoc(doc(db, 'sessions', session.id), {
    expectedEnd: ts(newEnd),
    extendedCount: increment(1),
    overdueConfirmedAt: serverTimestamp(),
  });
}

export function updateSession(sessionId, patch) {
  const p = { ...patch };
  if (p.params) p.params = cleanParams(p.params);
  if (p.expectedEnd) p.expectedEnd = ts(p.expectedEnd);
  return updateDoc(doc(db, 'sessions', sessionId), p);
}

/** Booking by someone else that would collide with extending to `newEnd`. */
export function conflictForExtension(session, newEnd, bookings) {
  const now = new Date();
  return bookings.find(
    (b) =>
      b.instrumentId === session.instrumentId &&
      b.userId !== session.userId &&
      b.status === 'booked' &&
      bookingIsLive(b, now) &&
      overlaps(now, newEnd, b.start, b.end),
  );
}

// ── Bookings ─────────────────────────────────────────────────────────────────
//
// Conflict-proof booking: every instrument has one small schedule document (bookingSchedules/{id}) that
// lists its upcoming bookings. A booking is created in a transaction that reads that document, checks for
// overlaps and writes the booking plus its schedule entry together (the security rules insist on the entry).
// If two people book overlapping times at the same moment, both transactions touch the same document, so
// Firestore commits only one; the other is retried automatically, now sees the clash and is refused.
// It also needs no collection scans: one small read and one write, instead of reading every booking.

const schedRef = (instrumentId) => doc(db, 'bookingSchedules', instrumentId);
const ACTIVE = ['booked', 'started'];

const once = (fn) => {
  let p;
  return () => (p ||= fn());
};

// Until the new security rules are deployed, writes that touch bookingSchedules are refused. Detect that
// once and use the previous behaviour, so publishing the app before the rules never breaks booking.
let schedulesDeployed = true;
async function withScheduleFallback(run, fallback) {
  if (!schedulesDeployed) return fallback();
  try {
    return await run();
  } catch (e) {
    if (e?.code !== 'permission-denied') throw e;
    try {
      await getDoc(schedRef('_probe'));
    } catch (probe) {
      if (probe?.code === 'permission-denied') {
        schedulesDeployed = false;
        return fallback();
      }
    }
    throw e;
  }
}

/** First use of an instrument's schedule: build it from the upcoming bookings already in the database. */
async function legacyEntries(instrumentId) {
  const snap = await getDocsFromServer(query(collection(db, 'bookings'), where('end', '>=', Timestamp.fromDate(new Date(Date.now() - HOUR)))));
  const out = {};
  for (const d of snap.docs) {
    const b = d.data();
    if (b.instrumentId === instrumentId && ACTIVE.includes(b.status)) out[d.id] = { s: b.start, e: b.end, uid: b.userId, name: b.userName || '' };
  }
  return out;
}

/**
 * Inside a transaction: the schedule entries for an instrument, with any entry whose booking overlaps
 * [start, end) verified against the booking itself (cancelled / released / deleted ones are dropped).
 * Returns { entries, clash } where clash is the first live booking that overlaps.
 */
async function readSchedule(tx, instrumentId, start, end, { ignoreId, legacy } = {}) {
  const snap = await tx.get(schedRef(instrumentId));
  const now = new Date();
  const entries = { ...(snap.exists() ? snap.data().b || {} : await legacy()) };
  // Housekeeping: forget bookings that ended more than an hour ago.
  for (const [id, e] of Object.entries(entries)) if (toDate(e.e) < new Date(now - HOUR)) delete entries[id];
  let clash = null;
  for (const [id, e] of Object.entries(entries)) {
    if (id === ignoreId || !overlaps(start, end, e.s, e.e)) continue;
    const b = await tx.get(doc(db, 'bookings', id));
    const data = b.exists() ? { id, ...b.data() } : null;
    if (data && ACTIVE.includes(data.status) && bookingIsLive(data, now)) {
      clash = clash || data;
    } else {
      delete entries[id];
    }
  }
  return { entries, clash };
}

/** Inside a transaction: someone else's running session that is still going at `start`. */
async function runningSessionAt(tx, instrumentId, uid, start) {
  const inst = await tx.get(doc(db, 'instruments', instrumentId));
  if (!inst.exists()) throw new Error('Instrument not found.');
  const i = inst.data();
  if (i.status === 'out_of_service') throw new Error('This instrument is out of service.');
  if (!i.activeSession || i.activeSession.uid === uid) return null;
  const s = await tx.get(doc(db, 'sessions', i.activeSession.sessionId));
  return s.exists() && s.data().status === 'active' && toDate(s.data().expectedEnd) > start ? s.data() : null;
}

function validateBookingTimes(instrument, start, end) {
  const maxH = instrument?.maxBookingHours || DEFAULT_MAX_BOOKING_HOURS;
  if (!(end > start)) throw new Error('End must be after start.');
  if (end <= new Date()) throw new Error('That time is already in the past.');
  if (end - start > maxH * HOUR) throw new Error(`Maximum booking length for this instrument is ${maxH} h.`);
}

const clashMessage = (b) => `Overlaps ${b.userName}'s booking ${fmtDateTime(b.start)} – ${fmtTime(b.end)}. Pick another time.`;

export async function createBooking({ instrument, profile, start, end, purpose }) {
  start = toDate(start);
  end = toDate(end);
  if (!canUseInstrument(instrument, profile)) {
    throw new Error(instrument.restricted ? 'This instrument needs training approval before you can book it.' : 'You cannot book this instrument.');
  }
  validateBookingTimes(instrument, start, end);
  const ref = doc(collection(db, 'bookings'));
  const data = {
    instrumentId: instrument.id,
    instrumentName: instrument.name,
    userId: profile.uid,
    userName: profile.name,
    userPhoto: profile.photoURL || '',
    start: ts(start),
    end: ts(end),
    purpose: String(purpose || '').trim().slice(0, 300),
    status: 'booked',
    createdAt: serverTimestamp(),
  };
  const legacy = once(() => legacyEntries(instrument.id)); // at most one query, even if the transaction retries
  await withScheduleFallback(
    () =>
      runTransaction(db, async (tx) => {
        const [sched, running] = await Promise.all([
          readSchedule(tx, instrument.id, start, end, { legacy }),
          runningSessionAt(tx, instrument.id, profile.uid, start),
        ]);
        if (sched.clash) throw new Error(clashMessage(sched.clash));
        if (running) throw new Error(`${running.userName} is using it until ${fmtDateTime(running.expectedEnd)}.`);
        tx.set(schedRef(instrument.id), {
          b: { ...sched.entries, [ref.id]: { s: ts(start), e: ts(end), uid: profile.uid, name: profile.name || '' } },
          updatedAt: serverTimestamp(),
        });
        tx.set(ref, data);
      }),
    // Old security rules (schedules not deployed yet): fresh server check, then a plain write.
    async () => {
      const clash = Object.entries(await legacyEntries(instrument.id)).find(([, e]) => overlaps(start, end, e.s, e.e));
      if (clash) throw new Error(`Overlaps ${clash[1].name}'s booking. Pick another time.`);
      await setDoc(ref, data);
    },
  );
  return ref.id;
}

export async function moveBooking(booking, start, end, instrument) {
  start = toDate(start);
  end = toDate(end);
  validateBookingTimes(instrument, start, end);
  const legacy = once(() => legacyEntries(booking.instrumentId));
  await runTransaction(db, async (tx) => {
    const { entries, clash } = await readSchedule(tx, booking.instrumentId, start, end, { ignoreId: booking.id, legacy });
    if (clash) throw new Error(clashMessage(clash));
    tx.set(schedRef(booking.instrumentId), {
      b: { ...entries, [booking.id]: { s: ts(start), e: ts(end), uid: booking.userId, name: booking.userName || '' } },
      updatedAt: serverTimestamp(),
    });
    tx.update(doc(db, 'bookings', booking.id), { start: ts(start), end: ts(end) });
  });
}

/** Frees the slot in the schedule in the same write as the status change. */
function freeSlot(batch, b) {
  batch.set(schedRef(b.instrumentId), { b: { [b.id]: deleteField() }, updatedAt: serverTimestamp() }, { merge: true });
}

export function cancelBooking(booking) {
  const patch = { status: 'cancelled', cancelledAt: serverTimestamp() };
  return withScheduleFallback(
    () => {
      const batch = writeBatch(db);
      batch.update(doc(db, 'bookings', booking.id), patch);
      freeSlot(batch, booking);
      return batch.commit();
    },
    () => updateDoc(doc(db, 'bookings', booking.id), patch),
  );
}

/** Releases no-shows. Run by every open client; the rules only allow it after the grace period. */
export async function releaseNoShows(bookings) {
  const now = new Date();
  const stale = bookings.filter((b) => bookingIsNoShow(b, now));
  await Promise.all(
    stale.map((b) => {
      const patch = { status: 'released', releasedAt: serverTimestamp() };
      return withScheduleFallback(
        () => {
          const batch = writeBatch(db);
          batch.update(doc(db, 'bookings', b.id), patch);
          freeSlot(batch, b);
          return batch.commit();
        },
        () => updateDoc(doc(db, 'bookings', b.id), patch),
      ).catch(() => {});
    }),
  );
  return stale.length;
}

// ── Templates ────────────────────────────────────────────────────────────────

export function saveTemplate({ instrumentId, name, params, sample, comments, profile }) {
  return addDoc(collection(db, 'templates'), {
    instrumentId,
    name: String(name).trim().slice(0, 80),
    params: cleanParams(params),
    sample: sample || '',
    comments: comments || '',
    createdBy: profile.uid,
    createdByName: profile.name,
    createdAt: serverTimestamp(),
  });
}
export function deleteTemplate(id) {
  return deleteDoc(doc(db, 'templates', id));
}

// ── Issues ───────────────────────────────────────────────────────────────────

export function reportIssue({ instrument, profile, description, severity, photos = [] }) {
  return addDoc(collection(db, 'issues'), {
    instrumentId: instrument.id,
    instrumentName: instrument.name,
    reportedBy: profile.uid,
    reportedByName: profile.name,
    description: String(description).trim().slice(0, 2000),
    severity: severity || 'minor',
    photos: photos.filter((p) => typeof p === 'string').slice(0, 4),
    status: 'open',
    createdAt: serverTimestamp(),
  });
}
export function resolveIssue(issue, profile, note) {
  return updateDoc(doc(db, 'issues', issue.id), {
    status: 'resolved',
    resolvedAt: serverTimestamp(),
    resolvedBy: profile.name,
    resolution: note || '',
  });
}
export function reopenIssue(issue) {
  return updateDoc(doc(db, 'issues', issue.id), { status: 'open' });
}

// ── Instruments (admin) ──────────────────────────────────────────────────────

const INSTRUMENT_FIELDS = [
  'name', 'type', 'room', 'location', 'photoURL', 'manualURL', 'safetyNotes',
  'requiredTraining', 'restricted', 'maxBookingHours', 'description', 'order',
];

function pickInstrument(data) {
  const out = {};
  for (const k of INSTRUMENT_FIELDS) if (data[k] !== undefined) out[k] = data[k];
  if (out.maxBookingHours != null) out.maxBookingHours = Math.max(1, parseInt(out.maxBookingHours, 10) || DEFAULT_MAX_BOOKING_HOURS);
  if (out.order != null) out.order = parseInt(out.order, 10) || 0;
  out.restricted = Boolean(out.restricted);
  return out;
}

export function createInstrument(data) {
  return addDoc(collection(db, 'instruments'), {
    ...pickInstrument(data),
    status: 'ok',
    outOfServiceReason: '',
    activeSession: null,
    freeSince: serverTimestamp(),
    createdAt: serverTimestamp(),
  });
}
export function updateInstrument(id, data) {
  return updateDoc(doc(db, 'instruments', id), pickInstrument(data));
}
export function setOutOfService(id, reason) {
  return updateDoc(doc(db, 'instruments', id), {
    status: reason ? 'out_of_service' : 'ok',
    outOfServiceReason: reason || '',
    outOfServiceSince: reason ? serverTimestamp() : null,
  });
}
export function deleteInstrument(id) {
  return deleteDoc(doc(db, 'instruments', id));
}

// ── Maintenance (admin) ──────────────────────────────────────────────────────

export function nextDueFrom(lastServiced, intervalDays) {
  const d = toDate(lastServiced);
  if (!d || !intervalDays) return null;
  return new Date(d.getTime() + intervalDays * 24 * HOUR);
}

export function saveMaintenance(id, data) {
  const payload = {
    instrumentId: data.instrumentId,
    instrumentName: data.instrumentName,
    kind: data.kind || 'maintenance',
    title: String(data.title || '').trim(),
    intervalDays: parseInt(data.intervalDays, 10) || 0,
    lastServiced: data.lastServiced ? ts(data.lastServiced) : null,
    nextDue: data.lastServiced && data.intervalDays ? ts(nextDueFrom(data.lastServiced, parseInt(data.intervalDays, 10))) : null,
    notes: data.notes || '',
    updatedAt: serverTimestamp(),
  };
  return id ? updateDoc(doc(db, 'maintenance', id), payload) : addDoc(collection(db, 'maintenance'), payload);
}
export function markServiced(item, profile, note) {
  const now = new Date();
  const log = [...(item.log || []), { at: Timestamp.fromDate(now), by: profile.name, note: note || '' }].slice(-50);
  return updateDoc(doc(db, 'maintenance', item.id), {
    lastServiced: Timestamp.fromDate(now),
    nextDue: item.intervalDays ? ts(nextDueFrom(now, item.intervalDays)) : null,
    log,
    updatedAt: serverTimestamp(),
  });
}
export function deleteMaintenance(id) {
  return deleteDoc(doc(db, 'maintenance', id));
}
