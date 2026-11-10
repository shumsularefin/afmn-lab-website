// Lab Dashboard data layer: Google sign-in and every Firestore read and write.
// Each write runs in one transaction or batch together with its activity-log entry; firestore.rules
// refuses any change that does not come with a matching log entry from the same person at the same time.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  connectAuthEmulator,
  signInWithCredential,
} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js';
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  collection,
  runTransaction,
  serverTimestamp,
  writeBatch,
  getDocFromServer,
  getDocsFromServer,
  query,
  orderBy,
  limit,
  startAfter,
} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js';

/** The permanent owner. Always super-admin; cannot be changed or removed (also enforced in firestore.rules). */
export const OWNER_EMAIL = 'muhammadshamsularefin01@gmail.com';
export const ROLES = ['super-admin', 'editor', 'contributor'];

export const roleInfo = {
  'super-admin': {
    label: 'Super-admin',
    summary: 'Everything: all website content, editor access, the activity log and backups.',
  },
  editor: {
    label: 'Lab editor',
    summary: 'All website content: home page, notices, PI profile, research, instruments, group members, publications, news, openings, gallery, teaching and contact details.',
  },
  contributor: {
    label: 'Contributor',
    summary: 'News, publications and the photo gallery. Suited to lab members who post updates.',
  },
};
const CONTRIBUTOR_SECTIONS = ['news', 'publications', 'gallery'];

export function permissions(role) {
  const superAdmin = role === 'super-admin';
  const editor = superAdmin || role === 'editor';
  return {
    any: ROLES.includes(role),
    superAdmin,
    section: (id) => editor || (role === 'contributor' && CONTRIBUTOR_SECTIONS.includes(id)),
    deleteAnyImage: superAdmin,
    editors: superAdmin,
    activity: superAdmin,
    backups: superAdmin,
  };
}

/** Someone else published the same section after this draft was started. */
export class ConflictError extends Error {
  constructor(section, revision) {
    super(`${section} was changed by another editor after you started editing.`);
    this.name = 'ConflictError';
    this.revision = revision;
  }
}

export function editorEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!/^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/.test(email) || email.length > 200) throw Error('Enter a valid Google account email.');
  return email;
}

// Firestore rejects undefined; drafts may contain it after edits.
const clean = (value) => JSON.parse(JSON.stringify(value ?? null));

/** Connects to Firebase (or the local emulators) and returns the data layer. */
export function connect(config) {
  const app = initializeApp(config.firebase, 'lab-dashboard');
  const auth = getAuth(app);
  const db = getFirestore(app);
  if (config.emulators) {
    const fs = new URL(config.emulators.firestore);
    connectFirestoreEmulator(db, fs.hostname, Number(fs.port));
    connectAuthEmulator(auth, config.emulators.auth, { disableWarnings: true });
  }
  const api = createCloud({ db, auth });
  // Local tests only: the Auth emulator accepts unsigned Google test accounts. Real Firebase rejects them.
  if (config.emulators)
    api.testSignIn = async (email) =>
      (await signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub: email.replace(/\W/g, ''), email, email_verified: true })))).user;
  return api;
}

function createCloud({ db, auth }) {
  const metaRef = doc(db, 'site', 'meta');
  const uid = () => auth.currentUser.uid;

  function audit(writer, action, target, detail = '') {
    const ref = doc(collection(db, 'auditLogs'));
    writer.set(ref, {
      actorUid: uid(),
      actorEmail: auth.currentUser.email.toLowerCase(),
      action,
      target: String(target).slice(0, 200),
      detail: String(detail).slice(0, 1000),
      createdAt: serverTimestamp(),
    });
    return ref.id;
  }
  const bumpMeta = (tx, metaSnap, section) =>
    tx.set(metaRef, {
      revision: (metaSnap.exists() ? metaSnap.data().revision || 0 : 0) + 1,
      section,
      updatedAt: serverTimestamp(),
      updatedBy: uid(),
      updatedByEmail: auth.currentUser.email.toLowerCase(),
    });

  return {
    async signIn() {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      return (await signInWithPopup(auth, provider)).user;
    },
    async currentUser() {
      await auth.authStateReady();
      return auth.currentUser;
    },
    signOut: () => firebaseSignOut(auth),

    /** The dashboard role of a signed-in user, or ''. */
    async role(user = auth.currentUser) {
      if (!user?.emailVerified) return '';
      const email = user.email.toLowerCase();
      if (email === OWNER_EMAIL) return 'super-admin';
      try {
        const grant = await getDocFromServer(doc(db, 'labEditors', email));
        return grant.exists() && grant.data().active === true && ROLES.includes(grant.data().role) ? grant.data().role : '';
      } catch {
        return '';
      }
    },

    /** Every published section with its revision (for conflict checks), and the site revision. */
    async load() {
      const [meta, docs] = await Promise.all([getDocFromServer(metaRef), getDocsFromServer(collection(db, 'content'))]);
      const sections = {};
      for (const d of docs.docs)
        sections[d.id] = {
          value: d.data().data,
          revision: d.data().revision || 0,
          updatedAt: d.data().updatedAt?.toDate?.() || null,
          updatedBy: d.data().updatedByEmail || '',
        };
      return {
        revision: meta.exists() ? meta.data().revision || 0 : 0,
        meta: meta.exists() ? { ...meta.data(), updatedAt: meta.data().updatedAt?.toDate?.() || null } : null,
        sections,
      };
    },

    /** Publishes one section. Throws ConflictError when someone else published it after baseRevision. */
    saveSection(id, value, baseRevision, detail = '') {
      const ref = doc(db, 'content', id);
      return runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        const meta = await tx.get(metaRef);
        const current = snap.exists() ? snap.data().revision || 0 : 0;
        if (current !== baseRevision) throw new ConflictError(id, current);
        const auditId = audit(tx, 'content.update', id, detail);
        tx.set(ref, {
          data: clean(value),
          revision: current + 1,
          updatedAt: serverTimestamp(),
          updatedBy: uid(),
          updatedByEmail: auth.currentUser.email.toLowerCase(),
          auditId,
        });
        bumpMeta(tx, meta, id);
        return current + 1;
      });
    },

    // ---------------------------------------------------------------- images (stored in Firestore: no Cloud Storage on the free plan)

    async uploadImage(dataUrl, name) {
      const id = crypto.randomUUID();
      const batch = writeBatch(db);
      const auditId = audit(batch, 'image.add', id, name);
      batch.set(doc(db, 'siteImages', id), {
        image: dataUrl,
        name: String(name).slice(0, 150),
        createdBy: uid(),
        createdByEmail: auth.currentUser.email.toLowerCase(),
        createdAt: serverTimestamp(),
        auditId,
      });
      await batch.commit();
      return `media:${id}`;
    },
    async images() {
      const snap = await getDocsFromServer(collection(db, 'siteImages'));
      return snap.docs.map((d) => ({
        id: d.id,
        reference: `media:${d.id}`,
        src: d.data().image,
        name: d.data().name || '',
        createdBy: d.data().createdBy,
        createdByEmail: d.data().createdByEmail || '',
        createdAt: d.data().createdAt?.toDate?.() || null,
      }));
    },
    async image(id) {
      const snap = await getDocFromServer(doc(db, 'siteImages', id));
      return snap.exists() ? snap.data().image : '';
    },
    deleteImage(id, name = '') {
      return runTransaction(db, async (tx) => {
        const auditId = audit(tx, 'image.delete', id, name);
        tx.set(doc(db, 'removals', `siteImages:${id}`), { auditId });
        tx.delete(doc(db, 'siteImages', id));
      });
    },

    // ---------------------------------------------------------------- editors and activity (super-admin)

    async editors() {
      const snap = await getDocsFromServer(collection(db, 'labEditors'));
      return snap.docs.map((d) => ({ ...d.data(), email: d.id, updatedAt: d.data().updatedAt?.toDate?.() || null })).sort((a, b) => a.email.localeCompare(b.email));
    },
    async setEditor(rawEmail, role, active, name = '') {
      const email = editorEmail(rawEmail);
      if (email === OWNER_EMAIL) throw Error('The owner account is always super-admin and cannot be changed.');
      if (!ROLES.includes(role)) throw Error('Choose a role.');
      const batch = writeBatch(db);
      const auditId = audit(batch, 'access.set', email, `${role}${active ? '' : ' (disabled)'}`);
      batch.set(doc(db, 'labEditors', email), { email, name: String(name).slice(0, 100), role, active, auditId, updatedAt: serverTimestamp(), updatedBy: uid() });
      await batch.commit();
    },
    deleteEditor(email) {
      return runTransaction(db, async (tx) => {
        const auditId = audit(tx, 'access.delete', email);
        tx.set(doc(db, 'removals', `labEditors:${email}`), { auditId });
        tx.delete(doc(db, 'labEditors', email));
      });
    },
    async activity(cursor = null) {
      const q = cursor
        ? query(collection(db, 'auditLogs'), orderBy('createdAt', 'desc'), startAfter(cursor), limit(50))
        : query(collection(db, 'auditLogs'), orderBy('createdAt', 'desc'), limit(50));
      const snap = await getDocsFromServer(q);
      return {
        entries: snap.docs.map((d) => ({ ...d.data(), createdAt: d.data().createdAt?.toDate?.() || null })),
        cursor: snap.docs.at(-1) || null,
      };
    },
  };
}
