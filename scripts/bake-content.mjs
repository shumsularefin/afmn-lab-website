// Bakes what was published from the Lab Dashboard into the site before it is deployed:
//   public/js/published.js   content of every published section, and the site revision
//   public/media/<id>.jpg    every uploaded image that the content uses
//   public/files/<id>.pdf    every uploaded document (such as the CV) that the content uses
// It reads Firestore through its public REST API (no keys). If Firestore cannot be read, it leaves
// public/ untouched and exits successfully, so a deploy never fails because of it; visitors' browsers
// then load the published content directly.
//
//   node scripts/bake-content.mjs              bake
//   node scripts/bake-content.mjs --check      print "changed=true|false": is the live site behind Firestore?
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const project = process.env.FIREBASE_PROJECT || JSON.parse(readFileSync(join(root, '.firebaserc'), 'utf8')).projects.default;
const origin = process.env.FIRESTORE_ORIGIN || 'https://firestore.googleapis.com';
const base = `${origin}/v1/projects/${project}/databases/(default)/documents`;
const site = process.env.SITE_URL || `https://${project}.web.app`;

function decodeValue(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if (v.arrayValue) return (v.arrayValue.values || []).map(decodeValue);
  if (v.mapValue) return decodeFields(v.mapValue.fields);
  return null;
}
const decodeFields = (fields = {}) => Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decodeValue(v)]));
async function get(path) {
  const r = await fetch(`${base}/${path}`, { signal: AbortSignal.timeout(20000) });
  if (r.status === 404) return null;
  if (!r.ok) throw Error(`Firestore ${r.status} for ${path}`);
  return r.json();
}
const output = (k, v) => { console.log(`${k}=${v}`); if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); };

async function liveRevision() {
  const meta = await get('site/meta');
  return meta?.fields?.revision ? Number(decodeValue(meta.fields.revision)) : 0;
}

async function check() {
  const live = await liveRevision();
  const text = await fetch(`${site}/js/published.js`, { cache: 'no-store', signal: AbortSignal.timeout(20000) }).then((r) => (r.ok ? r.text() : ''));
  const deployed = Number(/revision:\s*(\d+)/.exec(text)?.[1] || 0);
  console.log(`Firestore revision ${live}, deployed revision ${deployed}`);
  output('changed', live > deployed);
}

async function bake() {
  const revision = await liveRevision();
  const content = {};
  let pageToken = '';
  do {
    const list = await get(`content?pageSize=100${pageToken ? `&pageToken=${pageToken}` : ''}`);
    for (const d of list?.documents || []) {
      const data = decodeFields(d.fields).data;
      if (data) content[d.name.split('/').pop()] = data;
    }
    pageToken = list?.nextPageToken || '';
  } while (pageToken);

  const refs = [...new Set(JSON.stringify(content).match(/media:[a-f0-9-]{36}/g) || [])];
  const media = {};
  mkdirSync(join(root, 'public/media'), { recursive: true });
  for (const ref of refs) {
    const doc = await get(`siteImages/${ref.slice(6)}`);
    const data = doc && decodeValue(doc.fields.image);
    const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(data || '');
    if (!m) continue;
    const file = `media/${ref.slice(6)}.jpg`;
    writeFileSync(join(root, 'public', file), Buffer.from(m[1], 'base64'));
    media[ref] = file;
  }
  // Uploaded documents (file:<id>, such as the CV) become files/<id>.pdf.
  const files = {};
  const docRefs = [...new Set(JSON.stringify(content).match(/file:[a-f0-9-]{36}/g) || [])];
  if (docRefs.length) mkdirSync(join(root, 'public/files'), { recursive: true });
  for (const ref of docRefs) {
    const id = ref.slice(5);
    const info = await get(`siteFiles/${id}`);
    if (!info) continue;
    const meta = decodeFields(info.fields);
    const parts = [];
    for (let i = 0; i < meta.chunks; i++) parts.push(decodeValue((await get(`siteFiles/${id}/chunks/${i}`)).fields.data));
    const file = `files/${id}.pdf`;
    writeFileSync(join(root, 'public', file), Buffer.from(parts.join(''), 'base64'));
    files[ref] = file;
  }
  const js = `// Content published from the Lab Dashboard, baked in by scripts/bake-content.mjs on ${new Date().toISOString()}.\nconst PUBLISHED = ${JSON.stringify({ project, revision, content, media, files })};\n`;
  writeFileSync(join(root, 'public/js/published.js'), js);
  console.log(`Baked revision ${revision}: ${Object.keys(content).length} sections, ${Object.keys(media).length} images, ${Object.keys(files).length} documents.`);
}

try {
  await (process.argv.includes('--check') ? check() : bake());
} catch (error) {
  console.log(`::warning::Could not read the published content (${error.message}). The site is deployed as it is; browsers load published content directly.`);
  if (process.argv.includes('--check')) output('changed', false);
}
