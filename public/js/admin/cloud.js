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
    summary: 'Everything: all website content, forms and responses, editor access, the activity log and backups.',
  },
  editor: {
    label: 'Lab editor',
    summary: 'All website content: home page, notices, PI profile, research, instruments, group members, publications, news, openings, gallery, teaching and contact details, plus forms and their responses.',
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
    forms: editor,
    deleteForms: superAdmin,
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

// Documents (PDF) are split into base64 chunks below Firestore's 1 MiB document limit.
const FILE_MAX = 5 * 1024 * 1024;
const CHUNK = 900000;

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
      const [meta, docs, forms] = await Promise.all([
        getDocFromServer(metaRef),
        getDocsFromServer(collection(db, 'content')),
        getDocsFromServer(collection(db, 'forms')).catch(() => null), // rules older than the forms
      ]);
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
        forms: (forms?.docs || []).map((d) => ({
          value: { ...d.data(), closesAt: d.data().closesAt?.toDate?.() || null, updatedAt: undefined },
          revision: d.data().revision || 0,
          updatedAt: d.data().updatedAt?.toDate?.() || null,
          createdBy: d.data().createdBy,
        })),
      };
    },

    // ---------------------------------------------------------------- in-house forms

    /** Saves a normalized form. Throws ConflictError when it changed since baseRevision (0 = new). */
    saveForm(form, baseRevision) {
      const ref = doc(db, 'forms', form.id);
      return runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        const current = snap.exists() ? snap.data().revision || 0 : 0;
        if (current !== baseRevision) throw new ConflictError(form.title, current);
        const auditId = audit(tx, current ? 'form.update' : 'form.create', form.id, form.title);
        tx.set(ref, {
          ...clean({ ...form, closesAt: null }),
          closesAt: form.closesAt || null,
          createdBy: snap.exists() ? snap.data().createdBy : uid(),
          revision: current + 1,
          updatedAt: serverTimestamp(),
          updatedBy: uid(),
          auditId,
        });
        return current + 1;
      });
    },
    deleteForm(id) {
      return runTransaction(db, async (tx) => {
        const auditId = audit(tx, 'form.delete', id);
        tx.set(doc(db, 'removals', `forms:${id}`), { auditId });
        tx.delete(doc(db, 'forms', id));
      });
    },
    async responses(id) {
      const snap = await getDocsFromServer(collection(db, 'forms', id, 'responses'));
      return snap.docs.map((d) => ({ id: d.id, answers: d.data().answers || {}, submittedAt: d.data().submittedAt?.toDate?.() || null }));
    },
    async deleteResponses(id, ids) {
      for (let i = 0; i < ids.length; i += 400) {
        const batch = writeBatch(db);
        const auditId = audit(batch, 'form.responses.delete', id, `${ids.slice(i, i + 400).length} responses`);
        batch.set(doc(db, 'removals', `formResponses:${id}`), { auditId });
        for (const r of ids.slice(i, i + 400)) batch.delete(doc(db, 'forms', id, 'responses', r));
        await batch.commit();
      }
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

    // ---------------------------------------------------------------- documents such as the CV (PDF), stored in chunks

    async uploadDocument(file) {
      if (!file) throw Error('Choose a file.');
      if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) throw Error('Choose a PDF file.');
      if (file.size > FILE_MAX) throw Error('Choose a PDF smaller than 5 MB. Most PDF readers can “Reduce file size”.');
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = '';
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const base64 = btoa(binary);
      const chunks = [];
      for (let i = 0; i < base64.length; i += CHUNK) chunks.push(base64.slice(i, i + CHUNK));
      const id = crypto.randomUUID();
      const name = String(file.name || 'document.pdf').replace(/[^\w.\- ()]+/g, '_').slice(0, 120);
      const batch = writeBatch(db);
      const auditId = audit(batch, 'file.add', id, name);
      batch.set(doc(db, 'siteFiles', id), {
        name,
        type: 'application/pdf',
        size: file.size,
        chunks: chunks.length,
        createdBy: uid(),
        createdByEmail: auth.currentUser.email.toLowerCase(),
        createdAt: serverTimestamp(),
        auditId,
      });
      chunks.forEach((data, i) => batch.set(doc(db, 'siteFiles', id, 'chunks', String(i)), { data }));
      await batch.commit();
      return { reference: `file:${id}`, name };
    },
    async documents() {
      const snap = await getDocsFromServer(collection(db, 'siteFiles'));
      return snap.docs.map((d) => ({ id: d.id, reference: `file:${d.id}`, ...d.data(), createdAt: d.data().createdAt?.toDate?.() || null }));
    },
    async documentInfo(id) {
      const snap = await getDocFromServer(doc(db, 'siteFiles', id));
      return snap.exists() ? { id, ...snap.data() } : null;
    },
    /** The file as a Blob (for "Open"). */
    async documentBlob(id) {
      const info = await this.documentInfo(id);
      if (!info) throw Error('This file no longer exists.');
      const parts = await Promise.all([...Array(info.chunks).keys()].map((i) => getDocFromServer(doc(db, 'siteFiles', id, 'chunks', String(i)))));
      const binary = atob(parts.map((p) => p.data().data).join(''));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new Blob([bytes], { type: info.type || 'application/pdf' });
    },
    async deleteDocument(id, name = '') {
      const info = await this.documentInfo(id);
      if (!info) return;
      return runTransaction(db, async (tx) => {
        const auditId = audit(tx, 'file.delete', id, name);
        tx.set(doc(db, 'removals', `siteFiles:${id}`), { auditId });
        for (let i = 0; i < info.chunks; i++) tx.delete(doc(db, 'siteFiles', id, 'chunks', String(i)));
        tx.delete(doc(db, 'siteFiles', id));
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
