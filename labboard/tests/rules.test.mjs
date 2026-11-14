// Security-rules tests for the merged ../firestore.rules (LabBoard + the website's dashboard).
// Run with:  npm run test:rules      (needs the Firebase CLI + Java; uses the local emulator only)
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, test } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch, Timestamp, collection, addDoc, serverTimestamp } from 'firebase/firestore';

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

describe('uploaded images', () => {
  const JPEG = 'data:image/jpeg;base64,' + 'A'.repeat(1000);
  const img = (uid, kind = 'issue', extra = {}) => ({ image: JPEG, name: 'photo.jpg', kind, createdBy: uid, createdByName: uid, createdAt: serverTimestamp(), ...extra });

  test('approved users attach issue photos; pending users cannot', async () => {
    await assertSucceeds(setDoc(doc(as(users.guest), 'labImages', 'a'), img('guest')));
    await assertFails(setDoc(doc(as(users.pending), 'labImages', 'b'), img('pending')));
  });
  test('only admins upload instrument photos', async () => {
    await assertFails(setDoc(doc(as(users.alice), 'labImages', 'a'), img('alice', 'instrument')));
    await assertSucceeds(setDoc(doc(as(users.admin), 'labImages', 'a'), img('admin', 'instrument')));
  });
  test('only small JPEG data URLs, stored under your own uid', async () => {
    await assertFails(setDoc(doc(as(users.alice), 'labImages', 'a'), img('bob')));
    await assertFails(setDoc(doc(as(users.alice), 'labImages', 'a'), img('alice', 'issue', { image: 'data:image/png;base64,AAAA' })));
    await assertFails(setDoc(doc(as(users.alice), 'labImages', 'a'), img('alice', 'issue', { image: 'data:image/jpeg;base64,' + 'A'.repeat(280001) })));
    await assertFails(setDoc(doc(as(users.alice), 'labImages', 'a'), img('alice', 'issue', { extra: 1 })));
  });
  test('images never change; the uploader or an admin deletes them', async () => {
    await assertSucceeds(setDoc(doc(as(users.alice), 'labImages', 'a'), img('alice')));
    await assertFails(updateDoc(doc(as(users.alice), 'labImages', 'a'), { name: 'x' }));
    await assertFails(deleteDoc(doc(as(users.bob), 'labImages', 'a')));
    await assertSucceeds(deleteDoc(doc(as(users.alice), 'labImages', 'a')));
    await assertSucceeds(setDoc(doc(as(users.alice), 'labImages', 'b'), img('alice')));
    await assertSucceeds(deleteDoc(doc(as(users.admin), 'labImages', 'b')));
  });
  test('issue reports carry at most 4 photos', async () => {
    const issue = (photos) => ({ instrumentId: 'pcr', reportedBy: 'alice', description: 'x', status: 'open', photos });
    await assertSucceeds(addDoc(collection(as(users.alice), 'issues'), issue(['lbimg:a', 'lbimg:b'])));
    await assertFails(addDoc(collection(as(users.alice), 'issues'), issue(['1', '2', '3', '4', '5'])));
  });
});

describe('chemical inventory', () => {
  const chem = (extra = {}) => ({ name: 'Ethanol', formula: 'C2H6O', cas: '64-17-5', category: 'Solvents', hazards: ['flammable'],
    quantity: 2000, unit: 'mL', minQuantity: 500, containerSize: 2500, location: 'Cab A', expiry: null, reorder: null, lastLogId: 'l0', ...extra });
  const seed = () => env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), 'chemicals', 'etoh'), chem()));
  const log = (uid, extra = {}) => ({ type: 'use', chemicalId: 'etoh', chemicalName: 'Ethanol', unit: 'mL', amount: 50, before: 2000, after: 1950,
    note: 'HPLC', lotNo: '', userId: uid, userName: uid, createdAt: serverTimestamp(), ...extra });
  function use(db, uid, { logId = 'l1', q = 1950, logExtra = {}, chemExtra = {} } = {}) {
    const b = writeBatch(db);
    b.set(doc(db, 'chemicalLogs', logId), log(uid, logExtra));
    b.update(doc(db, 'chemicals', 'etoh'), { quantity: q, lastLogId: logId, updatedAt: serverTimestamp(), updatedBy: uid, ...chemExtra });
    return b.commit();
  }

  test('everyone approved can see the stock; strangers cannot', async () => {
    await seed();
    await assertSucceeds(getDoc(doc(as(users.guest), 'chemicals', 'etoh')));
    await assertFails(getDoc(doc(as(users.pending), 'chemicals', 'etoh')));
  });
  test('only admins add, edit or delete chemicals', async () => {
    await assertFails(setDoc(doc(as(users.alice), 'chemicals', 'x'), chem()));
    await assertSucceeds(setDoc(doc(as(users.admin), 'chemicals', 'x'), chem()));
    await assertFails(setDoc(doc(as(users.admin), 'chemicals', 'y'), chem({ quantity: -1 })));
    await assertFails(setDoc(doc(as(users.admin), 'chemicals', 'z'), chem({ unit: 'gallons' })));
    await assertFails(updateDoc(doc(as(users.alice), 'chemicals', 'x'), { location: 'Bin' }));
    await assertFails(deleteDoc(doc(as(users.alice), 'chemicals', 'x')));
    await assertSucceeds(updateDoc(doc(as(users.admin), 'chemicals', 'x'), { location: 'Cab B', quantity: 4000 }));
    await assertSucceeds(deleteDoc(doc(as(users.admin), 'chemicals', 'x')));
  });
  test('a member records usage together with a matching log entry', async () => {
    await seed();
    await assertSucceeds(use(as(users.alice), 'alice'));
  });
  test('usage cannot add stock, go below zero, or touch other fields', async () => {
    await seed();
    await assertFails(use(as(users.alice), 'alice', { q: 2100, logExtra: { after: 2100 } }));
    await assertFails(use(as(users.alice), 'alice', { q: -5, logExtra: { after: -5, amount: 2005 } }));
    await assertFails(use(as(users.alice), 'alice', { chemExtra: { location: 'Home' } }));
  });
  test('usage must agree with its log (amount, owner, chemical)', async () => {
    await seed();
    await assertFails(use(as(users.alice), 'alice', { logExtra: { after: 1990 } }));
    await assertFails(use(as(users.alice), 'alice', { logExtra: { userId: 'bob' } }));
    await assertFails(use(as(users.alice), 'alice', { logExtra: { before: 5000 } }));
    // A stock change without its log, or a log without the stock change.
    await assertFails(updateDoc(doc(as(users.alice), 'chemicals', 'etoh'), { quantity: 10, lastLogId: 'nope', updatedAt: serverTimestamp(), updatedBy: 'alice' }));
    await assertFails(setDoc(doc(as(users.alice), 'chemicalLogs', 'l9'), log('alice')));
  });
  test('guests cannot use chemicals; members cannot write restock entries', async () => {
    await seed();
    await assertFails(use(as(users.guest), 'guest'));
    await assertFails(use(as(users.alice), 'alice', { q: 2500, logExtra: { type: 'restock', after: 2500, amount: 500 } }));
    await assertSucceeds(use(as(users.admin), 'admin', { q: 2500, logExtra: { type: 'restock', after: 2500, amount: 500 } }));
  });
  test('logs are append-only', async () => {
    await seed();
    await use(as(users.alice), 'alice');
    await assertFails(updateDoc(doc(as(users.alice), 'chemicalLogs', 'l1'), { amount: 1 }));
    await assertFails(deleteDoc(doc(as(users.alice), 'chemicalLogs', 'l1')));
    await assertSucceeds(deleteDoc(doc(as(users.admin), 'chemicalLogs', 'l1')));
  });
  test('members can request a reorder once and withdraw their own request', async () => {
    await seed();
    const req = (uid) => ({ reorder: { uid, name: uid, note: 'almost empty', at: serverTimestamp() } });
    await assertFails(updateDoc(doc(as(users.guest), 'chemicals', 'etoh'), req('guest')));
    await assertFails(updateDoc(doc(as(users.alice), 'chemicals', 'etoh'), req('bob')));
    await assertSucceeds(updateDoc(doc(as(users.alice), 'chemicals', 'etoh'), req('alice')));
    await assertFails(updateDoc(doc(as(users.bob), 'chemicals', 'etoh'), req('bob')));
    await assertFails(updateDoc(doc(as(users.bob), 'chemicals', 'etoh'), { reorder: null }));
    await assertSucceeds(updateDoc(doc(as(users.alice), 'chemicals', 'etoh'), { reorder: null }));
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
