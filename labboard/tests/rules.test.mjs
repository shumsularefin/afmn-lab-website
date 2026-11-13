// Security-rules tests for the merged ../firestore.rules (LabBoard + the website's dashboard).
// Run with:  npm run test:rules      (needs the Firebase CLI + Java; uses the local emulator only)
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, test } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, writeBatch, Timestamp, collection, addDoc } from 'firebase/firestore';

let env;
const H = 3600e3;
const ts = (ms) => Timestamp.fromMillis(Date.now() + ms);

const users = {
  admin: { uid: 'admin', email: 'boss@gmail.com', role: 'admin' },
  alice: { uid: 'alice', email: 'alice@university.edu', role: 'member' },
  bob: { uid: 'bob', email: 'bob@university.edu', role: 'member' },
  guest: { uid: 'guest', email: 'monitor@gmail.com', role: 'guest' },
  pending: { uid: 'pending', email: 'stranger@gmail.com', role: 'guest', approved: false },
};
const OWNER = 'muhammadshamsularefin01@gmail.com';
const GOOGLE = { firebase: { sign_in_provider: 'google.com' } };
const as = (u) => env.authenticatedContext(u.uid, { email: u.email, email_verified: true, ...GOOGLE }).firestore();

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'labboard-test',
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') },
  });
});
after(() => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const u of Object.values(users)) {
      await setDoc(doc(db, 'users', u.uid), { uid: u.uid, email: u.email, name: u.uid, role: u.role, approved: u.approved ?? true, trainedOn: [] });
    }
    await setDoc(doc(db, 'instruments', 'pcr'), { name: 'PCR', restricted: false, maxBookingHours: 4, status: 'ok', activeSession: null });
    await setDoc(doc(db, 'instruments', 'confocal'), { name: 'Confocal', restricted: true, maxBookingHours: 6, status: 'ok', activeSession: null });
    await setDoc(doc(db, 'instruments', 'broken'), { name: 'Broken', restricted: false, status: 'out_of_service', activeSession: null });
  });
});

const session = (uid, instrumentId, extra = {}) => ({
  instrumentId, userId: uid, userName: uid, sample: 's', params: [{ key: 'T', value: '4' }], comments: '',
  status: 'active', startedAt: Timestamp.now(), expectedEnd: ts(H), ...extra,
});

async function start(db, uid, instrumentId, sid = `s-${uid}-${instrumentId}`) {
  const b = writeBatch(db);
  b.set(doc(db, 'sessions', sid), session(uid, instrumentId));
  b.update(doc(db, 'instruments', instrumentId), { activeSession: { sessionId: sid, uid } });
  return b.commit();
}

describe('sign-up & approval', () => {
  const fresh = (email, uid = 'new', extra = GOOGLE) => env.authenticatedContext(uid, { email, email_verified: true, ...extra }).firestore();
  const profile = (uid, email, role, approved) => ({ uid, email, name: 'x', role, approved, trainedOn: [] });

  test('the website owner becomes the first LabBoard admin', async () => {
    await assertSucceeds(setDoc(doc(fresh(OWNER), 'users', 'new'), profile('new', OWNER, 'admin', true)));
  });
  test('nobody else can self-assign admin or member by default (domain approval is off)', async () => {
    await assertFails(setDoc(doc(fresh('carol@university.edu'), 'users', 'new'), profile('new', 'carol@university.edu', 'admin', true)));
    await assertFails(setDoc(doc(fresh('carol@university.edu'), 'users', 'new'), profile('new', 'carol@university.edu', 'member', true)));
  });
  test('only Google sign-in counts', async () => {
    const pw = fresh(OWNER, 'new', { firebase: { sign_in_provider: 'password' } });
    await assertFails(setDoc(doc(pw, 'users', 'new'), profile('new', OWNER, 'admin', true)));
    await assertFails(getDoc(doc(pw, 'instruments', 'pcr')));
  });
  test('outsider cannot self-approve', async () => {
    await assertFails(setDoc(doc(fresh('eve@gmail.com'), 'users', 'new'), profile('new', 'eve@gmail.com', 'member', true)));
  });
  test('outsider is stored as pending guest', async () => {
    await assertSucceeds(setDoc(doc(fresh('eve@gmail.com'), 'users', 'new'), profile('new', 'eve@gmail.com', 'guest', false)));
  });
  test('allowlisted email gets the listed role', async () => {
    await env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), 'allowlist', 'dan@gmail.com'), { role: 'admin' }));
    await assertSucceeds(setDoc(doc(fresh('dan@gmail.com'), 'users', 'new'), profile('new', 'dan@gmail.com', 'admin', true)));
  });
  test('pending users cannot read the board', async () => {
    await assertFails(getDoc(doc(as(users.pending), 'instruments', 'pcr')));
    await assertSucceeds(getDoc(doc(as(users.guest), 'instruments', 'pcr')));
  });
  test('members cannot promote themselves or grant training', async () => {
    await assertFails(updateDoc(doc(as(users.alice), 'users', 'alice'), { role: 'admin' }));
    await assertFails(updateDoc(doc(as(users.alice), 'users', 'alice'), { trainedOn: ['confocal'] }));
    await assertSucceeds(updateDoc(doc(as(users.alice), 'users', 'alice'), { notify: false }));
  });
  test('admin approves users and grants training', async () => {
    await assertSucceeds(updateDoc(doc(as(users.admin), 'users', 'pending'), { approved: true, role: 'member' }));
    await assertSucceeds(updateDoc(doc(as(users.admin), 'users', 'alice'), { trainedOn: ['confocal'] }));
  });
});

describe('instruments', () => {
  test('only admins manage instruments', async () => {
    await assertFails(setDoc(doc(as(users.alice), 'instruments', 'x'), { name: 'X' }));
    await assertFails(updateDoc(doc(as(users.alice), 'instruments', 'pcr'), { status: 'out_of_service' }));
    await assertSucceeds(setDoc(doc(as(users.admin), 'instruments', 'x'), { name: 'X' }));
    await assertSucceeds(updateDoc(doc(as(users.admin), 'instruments', 'pcr'), { status: 'out_of_service', outOfServiceReason: 'lamp' }));
  });
});

describe('sessions', () => {
  test('member starts a session and claims the instrument', async () => {
    await assertSucceeds(start(as(users.alice), 'alice', 'pcr'));
  });
  test('second user cannot claim a busy instrument', async () => {
    await start(as(users.alice), 'alice', 'pcr');
    await assertFails(start(as(users.bob), 'bob', 'pcr'));
  });
  test('cannot claim with someone else\'s session id', async () => {
    const db = as(users.bob);
    await assertFails(updateDoc(doc(db, 'instruments', 'pcr'), { activeSession: { sessionId: 'nope', uid: 'bob' } }));
  });
  test('cannot start a session for another user', async () => {
    await assertFails(setDoc(doc(as(users.bob), 'sessions', 'x'), session('alice', 'pcr')));
  });
  test('guests cannot start sessions', async () => {
    await assertFails(setDoc(doc(as(users.guest), 'sessions', 'x'), session('guest', 'pcr')));
  });
  test('out-of-service instruments cannot be used', async () => {
    await assertFails(start(as(users.alice), 'alice', 'broken'));
  });
  test('restricted instrument requires training approval', async () => {
    await assertFails(start(as(users.alice), 'alice', 'confocal'));
    await env.withSecurityRulesDisabled((c) => updateDoc(doc(c.firestore(), 'users', 'alice'), { trainedOn: ['confocal'] }));
    await assertSucceeds(start(as(users.alice), 'alice', 'confocal'));
  });
  test('only the owner edits / finishes their session', async () => {
    await start(as(users.alice), 'alice', 'pcr', 's1');
    await assertFails(updateDoc(doc(as(users.bob), 'sessions', 's1'), { comments: 'hi' }));
    await assertSucceeds(updateDoc(doc(as(users.alice), 'sessions', 's1'), { comments: 'mine' }));
    // bob cannot release alice's instrument
    await assertFails(updateDoc(doc(as(users.bob), 'instruments', 'pcr'), { activeSession: null, freeSince: Timestamp.now() }));
    const a = as(users.alice);
    const b = writeBatch(a);
    b.update(doc(a, 'sessions', 's1'), { status: 'finished', endedAt: Timestamp.now() });
    b.update(doc(a, 'instruments', 'pcr'), { activeSession: null, freeSince: Timestamp.now() });
    await assertSucceeds(b.commit());
  });
  test('owner cannot move a session to another instrument', async () => {
    await start(as(users.alice), 'alice', 'pcr', 's1');
    await assertFails(updateDoc(doc(as(users.alice), 'sessions', 's1'), { instrumentId: 'confocal' }));
  });
  test('admin can force-finish', async () => {
    await start(as(users.alice), 'alice', 'pcr', 's1');
    const a = as(users.admin);
    const b = writeBatch(a);
    b.update(doc(a, 'sessions', 's1'), { status: 'finished', endedAt: Timestamp.now() });
    b.update(doc(a, 'instruments', 'pcr'), { activeSession: null, freeSince: Timestamp.now() });
    await assertSucceeds(b.commit());
  });
});

describe('bookings', () => {
  const booking = (uid, start, end, instrumentId = 'pcr') => ({ instrumentId, userId: uid, userName: uid, start: ts(start), end: ts(end), status: 'booked', purpose: '' });

  test('valid booking within max length', async () => {
    await assertSucceeds(addDoc(collection(as(users.alice), 'bookings'), booking('alice', H, 3 * H)));
  });
  test('booking longer than the instrument maximum is rejected', async () => {
    await assertFails(addDoc(collection(as(users.alice), 'bookings'), booking('alice', H, 6 * H)));
  });
  test('booking in the past is rejected', async () => {
    await assertFails(addDoc(collection(as(users.alice), 'bookings'), booking('alice', -3 * H, -H)));
  });
  test('restricted instrument booking needs training', async () => {
    await assertFails(addDoc(collection(as(users.alice), 'bookings'), booking('alice', H, 2 * H, 'confocal')));
  });
  test('others cannot cancel your booking', async () => {
    const ref = await addDoc(collection(as(users.alice), 'bookings'), booking('alice', H, 2 * H));
    await assertFails(updateDoc(doc(as(users.bob), 'bookings', ref.id), { status: 'cancelled', cancelledAt: Timestamp.now() }));
    await assertSucceeds(updateDoc(doc(as(users.alice), 'bookings', ref.id), { status: 'cancelled', cancelledAt: Timestamp.now() }));
  });
  test('no-show auto-release only after 30 minutes', async () => {
    const early = await addDoc(collection(as(users.alice), 'bookings'), booking('alice', -10 * 60e3, H));
    await assertFails(updateDoc(doc(as(users.bob), 'bookings', early.id), { status: 'released', releasedAt: Timestamp.now() }));
    const late = await addDoc(collection(as(users.alice), 'bookings'), booking('alice', -40 * 60e3, H));
    await assertSucceeds(updateDoc(doc(as(users.guest), 'bookings', late.id), { status: 'released', releasedAt: Timestamp.now() }));
  });
});

describe('templates, issues, maintenance', () => {
  test('templates belong to their creator', async () => {
    const ref = await addDoc(collection(as(users.alice), 'templates'), { instrumentId: 'pcr', name: 't', params: [], createdBy: 'alice' });
    await assertFails(updateDoc(doc(as(users.bob), 'templates', ref.id), { name: 'mine now' }));
    await assertSucceeds(updateDoc(doc(as(users.alice), 'templates', ref.id), { name: 'renamed' }));
  });
  test('any approved user (incl. guest) can report an issue; only admins resolve', async () => {
    const ref = await addDoc(collection(as(users.guest), 'issues'), { instrumentId: 'pcr', reportedBy: 'guest', description: 'beeping', status: 'open' });
    await assertFails(updateDoc(doc(as(users.alice), 'issues', ref.id), { status: 'resolved' }));
    await assertSucceeds(updateDoc(doc(as(users.admin), 'issues', ref.id), { status: 'resolved' }));
    await assertFails(addDoc(collection(as(users.pending), 'issues'), { instrumentId: 'pcr', reportedBy: 'pending', description: 'x', status: 'open' }));
  });
  test('only admins write maintenance', async () => {
    await assertFails(addDoc(collection(as(users.alice), 'maintenance'), { title: 'x' }));
    await assertSucceeds(addDoc(collection(as(users.admin), 'maintenance'), { title: 'x' }));
  });
});

describe('the website dashboard is unaffected', () => {
  const anon = () => env.unauthenticatedContext().firestore();
  test('public site content is still world-readable and not world-writable', async () => {
    await env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), 'content', 'home'), { data: {}, revision: 1 }));
    await assertSucceeds(getDoc(doc(anon(), 'content', 'home')));
    await assertFails(setDoc(doc(anon(), 'content', 'home'), { data: {}, revision: 2 }));
  });
  test('LabBoard admins/members get no website-editing or editor-list powers', async () => {
    await assertFails(setDoc(doc(as(users.admin), 'content', 'home'), { data: {}, revision: 2 }));
    await assertFails(getDoc(doc(as(users.admin), 'labEditors', 'x@y.z')));
    await assertFails(getDoc(doc(as(users.alice), 'auditLogs', 'a1')));
  });
  test('website editors cannot read LabBoard data unless they are LabBoard users', async () => {
    const stranger = env.authenticatedContext('web', { email: 'editor@gmail.com', email_verified: true, ...GOOGLE }).firestore();
    await assertFails(getDoc(doc(stranger, 'instruments', 'pcr')));
    await assertFails(getDoc(doc(anon(), 'sessions', 'x')));
  });
});
