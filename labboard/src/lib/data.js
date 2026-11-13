// All Firestore writes live here so pages stay simple.
import {
  addDoc,
  collection,
  deleteDoc,
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

  if (!snap.exists()) {
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

  const cur = snap.data();
  const patch = { lastLoginAt: serverTimestamp(), name: fbUser.displayName || cur.name, photoURL: fbUser.photoURL || cur.photoURL || '' };
  if (!cur.approved && access.approved) Object.assign(patch, access);
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

  await runTransaction(db, async (tx) => {
    const fresh = await tx.get(instRef);
    if (!fresh.exists()) throw new Error('Instrument not found.');
    const d = fresh.data();
    if (d.status === 'out_of_service') throw new Error('Instrument is out of service.');
    if (d.activeSession) throw new Error('Someone just started a session on this instrument.');

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

function findConflict(list, start, end, ignoreId) {
  const now = new Date();
  return list.find((b) => b.id !== ignoreId && ['booked', 'started'].includes(b.status) && bookingIsLive(b, now) && overlaps(start, end, b.start, b.end));
}

async function bookingsForInstrument(instrumentId) {
  const snap = await getDocsFromServer(query(collection(db, 'bookings'), where('instrumentId', '==', instrumentId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function createBooking({ instrument, profile, start, end, purpose, activeSession }) {
  start = toDate(start);
  end = toDate(end);
  const maxH = instrument.maxBookingHours || DEFAULT_MAX_BOOKING_HOURS;
  if (!canUseInstrument(instrument, profile)) {
    throw new Error(instrument.restricted ? 'This instrument needs training approval before you can book it.' : 'You cannot book this instrument.');
  }
  if (!(end > start)) throw new Error('End must be after start.');
  if (end <= new Date()) throw new Error('That time is already in the past.');
  if (end - start > maxH * HOUR) throw new Error(`Maximum booking length for this instrument is ${maxH} h.`);
  if (activeSession && activeSession.userId !== profile.uid && toDate(activeSession.expectedEnd) > start) {
    throw new Error(`${activeSession.userName} is using it until ${fmtDateTime(activeSession.expectedEnd)}.`);
  }

  const existing = await bookingsForInstrument(instrument.id);
  const clash = findConflict(existing, start, end);
  if (clash) throw new Error(`Overlaps ${clash.userName}'s booking ${fmtDateTime(clash.start)} – ${fmtTime(clash.end)}. Pick another time.`);

  const ref = await addDoc(collection(db, 'bookings'), {
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
  });

  // Race check: if two people booked the same slot at the same moment, the
  // earlier-created booking wins and the later one is removed.
  const after = await bookingsForInstrument(instrument.id);
  const mine = after.find((b) => b.id === ref.id);
  const rival = after.find(
    (b) =>
      b.id !== ref.id &&
      ['booked', 'started'].includes(b.status) &&
      overlaps(start, end, b.start, b.end) &&
      (toDate(b.createdAt) < toDate(mine?.createdAt) || (+toDate(b.createdAt) === +toDate(mine?.createdAt) && b.id < ref.id)),
  );
  if (rival) {
    await deleteDoc(ref);
    throw new Error(`${rival.userName} booked this slot a moment before you.`);
  }
  return ref.id;
}

export async function moveBooking(booking, start, end, instrument) {
  const maxH = instrument?.maxBookingHours || DEFAULT_MAX_BOOKING_HOURS;
  if (!(toDate(end) > toDate(start))) throw new Error('End must be after start.');
  if (toDate(end) - toDate(start) > maxH * HOUR) throw new Error(`Maximum booking length is ${maxH} h.`);
  const existing = await bookingsForInstrument(booking.instrumentId);
  const clash = findConflict(existing, start, end, booking.id);
  if (clash) throw new Error(`Overlaps ${clash.userName}'s booking.`);
  return updateDoc(doc(db, 'bookings', booking.id), { start: ts(start), end: ts(end) });
}

export function cancelBooking(booking) {
  return updateDoc(doc(db, 'bookings', booking.id), { status: 'cancelled', cancelledAt: serverTimestamp() });
}

/** Releases no-shows. Run by every open client; the rules only allow it after the grace period. */
export async function releaseNoShows(bookings) {
  const now = new Date();
  const stale = bookings.filter((b) => bookingIsNoShow(b, now));
  await Promise.all(
    stale.map((b) => updateDoc(doc(db, 'bookings', b.id), { status: 'released', releasedAt: serverTimestamp() }).catch(() => {})),
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
