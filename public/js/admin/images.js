// Image fields: upload from the device (resized and compressed in the browser) or choose an image
// uploaded earlier. Images are stored in Firestore (siteImages/{id}); content refers to them as
// media:<id>. Pictures that shipped with the site (images/…) keep working as plain paths.
import { h, $, $$, toast, openDialog, busy, confirmDialog, errorMessage } from './ui.js';

const MAX_BYTES = 280000;

/** Resizes to at most 1600 px and compresses to a JPEG data URL under the database limit. */
export async function prepareImage(file) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw Error('Choose a JPG, PNG or WebP image.');
  if (file.size > 20 * 1024 * 1024) throw Error('Choose an image smaller than 20 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    for (const longest of [1600, 1300, 1000, 800]) {
      const scale = Math.min(1, longest / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const context = canvas.getContext('2d');
      context.fillStyle = 'white';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.84, 0.72, 0.6, 0.48]) {
        const data = canvas.toDataURL('image/jpeg', quality);
        if (data.length <= MAX_BYTES) return data;
      }
    }
  } finally {
    bitmap.close();
  }
  throw Error('This image is too detailed to store. Crop it or choose a smaller image.');
}

const srcCache = new Map();
/** A displayable src for a stored reference. */
export async function imageSrc(app, ref) {
  if (!ref) return '';
  if (!ref.startsWith('media:')) return ref;
  if (!srcCache.has(ref)) {
    const p = app.cloud.image(ref.slice(6));
    srcCache.set(ref, p);
    p.catch(() => srcCache.delete(ref));
  }
  return srcCache.get(ref);
}

export const imageFieldHTML = (f, path, value = '') => `
  <div class="ed-field ed-wide ed-image-field" data-image="${h(path)}" data-value="${h(value || '')}">
    <span class="ed-label">${h(f.label)}</span>
    <div class="ed-image-row">
      <div class="ed-image-box"><img alt="Selected image"${value ? '' : ' hidden'}><span class="ed-image-empty"${value ? ' hidden' : ''}>No image</span></div>
      <div class="ed-actions">
        <button type="button" class="ed-btn ed-btn-small" data-upload>Upload from device</button>
        <button type="button" class="ed-btn ed-btn-small ed-btn-quiet" data-library>Choose uploaded image</button>
        <button type="button" class="ed-btn ed-btn-small ed-btn-quiet" data-clear${value ? '' : ' hidden'}>Remove image</button>
      </div>
    </div>
    <input type="file" accept="image/jpeg,image/png,image/webp" hidden>
    ${f.hint ? `<small>${h(f.hint)}</small>` : ''}
  </div>`;

/** Wires one image field. onSet(reference) stores the new value. */
export function wireImage(box, app, onSet) {
  const file = $('input[type="file"]', box);
  const img = $('img', box);
  let current = '';
  const show = async (ref) => {
    current = ref;
    $('.ed-image-empty', box).hidden = !!ref;
    $('[data-clear]', box).hidden = !ref;
    img.hidden = !ref;
    img.removeAttribute('src');
    if (ref) img.src = await imageSrc(app, ref).catch(() => '');
  };
  const choose = (ref) => { show(ref); onSet(ref); };
  show(box.dataset.value || '');
  $('[data-upload]', box).addEventListener('click', () => file.click());
  file.addEventListener('change', () =>
    busy($('[data-upload]', box), 'Uploading…', async () => {
      const f = file.files[0];
      file.value = '';
      if (!f) return;
      const ref = await uploadFile(app, f);
      choose(ref);
    }),
  );
  $('[data-library]', box).addEventListener('click', async () => {
    const ref = await chooseImage(app, current);
    if (ref) choose(ref);
  });
  $('[data-clear]', box).addEventListener('click', () => choose(''));
}

export async function uploadFile(app, file) {
  const data = await prepareImage(file);
  const ref = await app.cloud.uploadImage(data, file.name || 'image.jpg');
  srcCache.set(ref, Promise.resolve(data));
  app.imageList = null;
  toast('Image uploaded and optimized. Publish the section to show it on the website.');
  return ref;
}

/** Where each media:<id> is used, from published content and drafts. */
export function usage(app) {
  const map = new Map();
  const scan = (value, label) => {
    for (const ref of new Set(JSON.stringify(value ?? null).match(/media:[a-f0-9-]{36}/g) || [])) {
      const list = map.get(ref) || [];
      if (!list.includes(label)) list.push(label);
      map.set(ref, list);
    }
  };
  for (const [id, s] of Object.entries(app.data.sections)) scan(s.value, app.sectionTitle(id));
  for (const name of app.drafts.names()) scan(app.drafts.get(name).value, `Draft: ${app.sectionTitle(name.split(':')[1])}`);
  return map;
}

async function loadImages(app) {
  app.imageList ||= await app.cloud.images();
  for (const img of app.imageList) srcCache.set(img.reference, Promise.resolve(img.src));
  return app.imageList;
}

const day = (d) => (d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

/** The image library: search, see where each image is used, delete unused ones. Resolves with a reference when choosing. */
export function chooseImage(app, current = '', { manage = false } = {}) {
  return openDialog(
    `<h2>${manage ? 'Image library' : 'Choose an image'}</h2><div class="ed-dialog-body">
      <div class="ed-library-tools"><input type="search" data-q placeholder="Search by file name, section or month" aria-label="Search images">
      <select data-filter aria-label="Show"><option value="">All images</option><option value="used">In use</option><option value="unused">Not used anywhere</option></select></div>
      <div class="ed-library" data-grid><p class="ed-muted">Loading images…</p></div></div>
      <div class="ed-actions"><button type="button" class="ed-btn ed-btn-quiet" data-close>Close</button></div>`,
    (dialog, close) => {
      let images = [];
      const uses = usage(app);
      const draw = () => {
        const q = $('[data-q]', dialog).value.trim().toLowerCase();
        const filter = $('[data-filter]', dialog).value;
        const list = images
          .filter((i) => (filter === 'used' ? uses.has(i.reference) : filter === 'unused' ? !uses.has(i.reference) : true))
          .filter((i) => !q || [i.name, day(i.createdAt), ...(uses.get(i.reference) || [])].join(' ').toLowerCase().includes(q))
          .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
        $('[data-grid]', dialog).innerHTML = list.length
          ? `<div class="ed-library-grid">${list
              .map((i) => {
                const u = uses.get(i.reference) || [];
                const mayDelete = !u.length && (app.perms.deleteAnyImage || i.createdBy === app.user.uid);
                return `<figure class="${i.reference === current ? 'ed-current' : ''}"><img src="${h(i.src)}" alt="" loading="lazy"><figcaption><strong>${h(i.name)}</strong><small>${h(day(i.createdAt))}${i.createdByEmail ? ' · ' + h(i.createdByEmail) : ''}</small><small>${u.length ? 'Used in: ' + h(u.join(', ')) : 'Not used anywhere'}</small></figcaption>
                <div class="ed-actions">${manage ? '' : `<button type="button" class="ed-btn ed-btn-small ed-btn-primary" data-pick="${h(i.reference)}">Use this image</button>`}${mayDelete ? `<button type="button" class="ed-btn ed-btn-small ed-btn-danger-quiet" data-delete="${h(i.id)}">Delete</button>` : ''}</div></figure>`;
              })
              .join('')}</div>`
          : `<p class="ed-muted">${images.length ? 'No image matches.' : 'No images uploaded yet. Use “Upload from device” on any image field.'}</p>`;
      };
      loadImages(app)
        .then((list) => { images = list; draw(); })
        .catch((e) => ($('[data-grid]', dialog).innerHTML = `<p class="ed-error-text">${h(errorMessage(e))}</p>`));
      $('[data-q]', dialog).addEventListener('input', draw);
      $('[data-filter]', dialog).addEventListener('change', draw);
      dialog.addEventListener('click', async (e) => {
        const pick = e.target.closest('[data-pick]');
        if (pick) close(pick.dataset.pick);
        const del = e.target.closest('[data-delete]');
        if (del) {
          const img = images.find((i) => i.id === del.dataset.delete);
          if (!(await confirmDialog({ title: 'Delete this image?', body: `<p>${h(img.name)} is not used anywhere. It is removed for good.</p>`, confirm: 'Delete image', danger: true }))) return;
          await busy(del, 'Deleting…', async () => {
            await app.cloud.deleteImage(img.id, img.name);
            images = images.filter((i) => i !== img);
            app.imageList = images;
            draw();
            toast('Image deleted.');
          });
        }
      });
    },
    { wide: true },
  );
}
