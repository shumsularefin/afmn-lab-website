// Uploaded photos without Cloud Storage (same approach as the ACS GSTU site).
//
// The Spark plan has no Storage bucket, so the browser resizes each photo and compresses it to a JPEG
// data URL small enough for one Firestore document (≤ 280 KB, checked again by the security rules).
// Content stores a reference, lbimg:<id>, never the image itself, so instrument and issue documents stay
// small and an image can be reused. References resolve once per page load and are then cached.
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import { toDate } from './time';

export const MAX_IMAGE_BYTES = 280000;
export const REF_PREFIX = 'lbimg:';
const ID = /^[A-Za-z0-9]{20}$/;
const DATA_URL = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;

export const isImageRef = (v) => typeof v === 'string' && v.startsWith(REF_PREFIX) && ID.test(v.slice(REF_PREFIX.length));
export const refId = (ref) => ref.slice(REF_PREFIX.length);

/** Resizes to at most 1600 px on the long side and compresses until it fits in one document. */
export async function prepareImage(file) {
  if (!file || !/^image\//.test(file.type || 'image/')) throw new Error('Choose a photo (JPG, PNG, WebP or HEIC).');
  if (file.size > 25 * 1024 * 1024) throw new Error('Choose an image smaller than 25 MB.');
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('This browser cannot read that image format. Try a JPG or PNG.');
  }
  try {
    for (const longest of [1600, 1280, 1000, 800]) {
      const scale = Math.min(1, longest / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; // JPEG has no transparency.
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.85, 0.75, 0.65, 0.55, 0.45]) {
        const data = canvas.toDataURL('image/jpeg', quality);
        if (data.length <= MAX_IMAGE_BYTES) return { data, width: canvas.width, height: canvas.height };
      }
    }
  } finally {
    bitmap.close?.();
  }
  throw new Error('This image is too detailed to store. Crop it or choose a smaller one.');
}

const cache = new Map(); // ref -> Promise<dataURL>

/** Optimizes and uploads a file. Resolves with its lbimg:<id> reference. */
export async function uploadImage(file, { kind = 'other', profile }) {
  const { data } = await prepareImage(file);
  const ref = doc(collection(db, 'labImages'));
  await setDoc(ref, {
    image: data,
    name: String(file.name || 'photo.jpg').slice(0, 150),
    kind,
    createdBy: profile.uid,
    createdByName: profile.name || '',
    createdAt: serverTimestamp(),
  });
  const reference = REF_PREFIX + ref.id;
  cache.set(reference, Promise.resolve(data));
  return reference;
}

/** A displayable src for a stored value: lbimg:<id> references resolve, plain URLs pass through. */
export function resolveImage(value) {
  if (!value) return Promise.resolve('');
  if (!isImageRef(value)) return Promise.resolve(/^(https:|data:image\/)/.test(value) ? value : '');
  if (!cache.has(value)) {
    const p = getDoc(doc(db, 'labImages', refId(value))).then((snap) => {
      const src = snap.data()?.image;
      if (!DATA_URL.test(src || '')) throw new Error('Image unavailable');
      return src;
    });
    cache.set(value, p);
    p.catch(() => cache.delete(value));
  }
  return cache.get(value);
}

export async function listImages() {
  const snap = await getDocs(collection(db, 'labImages'));
  return snap.docs
    .map((d) => {
      const x = d.data();
      const reference = REF_PREFIX + d.id;
      if (DATA_URL.test(x.image || '')) cache.set(reference, Promise.resolve(x.image));
      return { id: d.id, reference, image: x.image, name: x.name, kind: x.kind, createdBy: x.createdBy, createdByName: x.createdByName, createdAt: toDate(x.createdAt), bytes: (x.image || '').length };
    })
    .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
}

export async function deleteImage(id) {
  await deleteDoc(doc(db, 'labImages', id));
  cache.delete(REF_PREFIX + id);
}

/** reference -> [label] for every instrument, issue and chemical that shows the image. */
export function imageUsage(instruments = [], issues = [], chemicals = []) {
  const usage = new Map();
  const add = (ref, label) => isImageRef(ref) && usage.set(ref, [...(usage.get(ref) || []), label]);
  for (const i of instruments) add(i.photoURL, `${i.name} photo`);
  for (const i of issues) for (const p of i.photos || []) add(p, `Issue · ${i.instrumentName || 'instrument'}`);
  for (const c of chemicals) add(c.photo, `Chemical · ${c.name}`);
  return usage;
}

export const fmtBytes = (n) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);
