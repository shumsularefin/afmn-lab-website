// The public page of an in-house form: /form/<id> (or form.html?id=<id>). Reads the form and stores
// the answers through Firestore's public REST API; the security rules accept answers only while the
// form is open, and only lab editors can read them.
import { checkAnswers, responseId, formState, dayLabel } from './model.js';

const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const EMULATOR = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? (() => { try { return localStorage.getItem('afmn-emulator') || ''; } catch { return ''; } })() : '';
const [ORIGIN, PROJECT] = EMULATOR ? EMULATOR.split('|') : ['https://firestore.googleapis.com', (typeof PUBLISHED !== 'undefined' && PUBLISHED.project) || 'afmn-lab'];
const BASE = `${ORIGIN}/v1/projects/${PROJECT}/databases/(default)/documents`;

function decode(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if (v.arrayValue) return (v.arrayValue.values || []).map(decode);
  if (v.mapValue) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, decode(x)]));
  return null;
}
const encode = (v) =>
  Array.isArray(v) ? { arrayValue: { values: v.map(encode) } } : typeof v === 'object' && v ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)])) } } : { stringValue: String(v) };

async function getForm(id) {
  const r = await fetch(`${BASE}/forms/${encodeURIComponent(id)}`, { cache: 'no-store' });
  if (r.status === 404) return null;
  if (!r.ok) throw Error(String(r.status));
  return decode({ mapValue: { fields: (await r.json()).fields } });
}
async function submit(id, answers) {
  const name = `projects/${PROJECT}/databases/(default)/documents/forms/${id}/responses/${responseId()}`;
  const r = await fetch(`${BASE}:commit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes: [{ update: { name, fields: { answers: encode(answers) } }, updateTransforms: [{ fieldPath: 'submittedAt', setToServerValue: 'REQUEST_TIME' }], currentDocument: { exists: false } }] }),
  });
  if (!r.ok) throw Object.assign(Error('Not accepted'), { status: r.status });
}

const inputTypes = { short: 'text', email: 'email', phone: 'tel', url: 'url', number: 'text', date: 'date' };
const extras = { short: 'maxlength="300"', email: 'maxlength="300" autocomplete="email"', phone: 'maxlength="20" autocomplete="tel" placeholder="01XXXXXXXXX"', url: 'maxlength="300" placeholder="https://"', number: 'maxlength="40" inputmode="decimal"', date: '' };

function control(f) {
  const id = h(f.id), req = f.required ? ' required' : '';
  if (f.type === 'paragraph') return `<textarea id="pf-${id}" name="${id}" rows="5" maxlength="4000"${req}></textarea>`;
  if (f.type in inputTypes) return `<input id="pf-${id}" name="${id}" type="${inputTypes[f.type]}" ${extras[f.type]}${f.id === 'name' ? ' autocomplete="name"' : ''}${req}>`;
  if (f.type === 'dropdown') return `<select id="pf-${id}" name="${id}"${req}><option value="">Choose…</option>${f.options.map((o) => `<option>${h(o)}</option>`).join('')}</select>`;
  const type = f.type === 'checkboxes' ? 'checkbox' : 'radio';
  const opts = f.options.map((o) => `<label class="pf-option"><input type="${type}" name="${id}" value="${h(o)}"><span>${h(o)}</span></label>`);
  if (f.other) opts.push(`<label class="pf-option pf-other"><input type="${type}" name="${id}" value="__other"><span>Other:</span><input type="text" name="${id}__other" maxlength="300" aria-label="${h(f.label)}: other answer"></label>`);
  return `<div class="pf-options">${opts.join('')}</div>`;
}
function question(f) {
  if (f.type === 'section') return `<div class="pf-section"><h2>${h(f.label)}</h2>${f.help ? `<p>${h(f.help)}</p>` : ''}</div>`;
  const group = ['choice', 'checkboxes'].includes(f.type);
  const star = f.required ? '<span class="pf-req" aria-hidden="true">*</span>' : '';
  const title = group ? `<legend class="pf-label">${h(f.label)}${star}</legend>` : `<label class="pf-label" for="pf-${h(f.id)}">${h(f.label)}${star}</label>`;
  const tag = group ? 'fieldset' : 'div';
  return `<${tag} class="pf-q">${title}${f.help ? `<p class="pf-help">${h(f.help)}</p>` : ''}${control(f)}<p class="pf-error" id="${h(f.id)}-error" hidden></p></${tag}>`;
}
function readRaw(form) {
  const raw = {}, data = new FormData(form);
  for (const [name, value] of data) {
    if (name.endsWith('__other') || name === 'pf_website') continue;
    const v = value === '__other' ? String(data.get(`${name}__other`) || '').trim() : String(value);
    const el = form.elements[name];
    const many = el instanceof RadioNodeList ? [...el].some((i) => i.type === 'checkbox') : el?.type === 'checkbox';
    if (many) (raw[name] ||= []).push(v);
    else raw[name] = v;
  }
  return raw;
}

const root = document.getElementById('form-root');
const id = decodeURIComponent(location.pathname.match(/\/form\/([^/]+)/)?.[1] || new URLSearchParams(location.search).get('id') || '');

async function start() {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) return (root.innerHTML = '<div class="pf"><h1>Form not found</h1><p>Check the link you were given.</p></div>');
  let form;
  try {
    form = await getForm(id);
  } catch {
    return (root.innerHTML = '<div class="pf"><h1>This form could not load</h1><p>Check your connection and reload the page.</p></div>');
  }
  if (!form || form.status === 'draft') return (root.innerHTML = '<div class="pf"><h1>Form not found</h1><p>It may have been removed. Check the link you were given.</p></div>');
  document.title = `${form.title} · AFMN Lab, GSTU`;
  const state = formState(form);
  const head = `<header class="pf-head"><div class="label">AFMN Lab form</div><h1>${h(form.title)}</h1>${String(form.description || '').split(/\n+/).filter(Boolean).map((p) => `<p>${h(p)}</p>`).join('')}${form.closesAt ? `<p class="pf-deadline">Open until ${h(dayLabel(form.closesAt))}</p>` : ''}</header>`;
  if (state !== 'open') return (root.innerHTML = `<div class="pf">${head}<p class="pf-closed" role="status">This form is no longer accepting responses.</p></div>`);
  root.innerHTML = `<form class="pf" novalidate>${head}<p class="pf-required-note"><span class="pf-req">*</span> Required</p>${form.fields.map(question).join('')}
    <div class="pf-hp" aria-hidden="true"><label>Leave this empty <input name="pf_website" tabindex="-1" autocomplete="off"></label></div>
    <div class="pf-submit"><button type="submit" class="btn">Submit</button><p class="pf-status" role="status" aria-live="polite"></p></div></form>`;
  const el = root.querySelector('form'), status = el.querySelector('.pf-status'), button = el.querySelector('button[type=submit]');
  el.addEventListener('input', (e) => {
    if (e.target.name?.endsWith('__other') && e.target.value) {
      const choice = el.querySelector(`input[name="${CSS.escape(e.target.name.slice(0, -7))}"][value="__other"]`);
      if (choice) choice.checked = true;
    }
  });
  el.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { answers, errors } = checkAnswers(form, readRaw(el));
    for (const p of el.querySelectorAll('.pf-error')) { p.hidden = true; p.textContent = ''; }
    for (const x of el.querySelectorAll('[aria-invalid]')) x.removeAttribute('aria-invalid');
    const ids = Object.keys(errors);
    for (const fid of ids) {
      const p = el.querySelector(`#${CSS.escape(fid)}-error`);
      p.hidden = false;
      p.textContent = errors[fid];
      p.closest('.pf-q').querySelectorAll('input, select, textarea').forEach((i) => i.setAttribute('aria-invalid', 'true'));
    }
    if (ids.length) {
      status.textContent = 'Please check the highlighted questions.';
      el.querySelector(`#${CSS.escape(ids[0])}-error`).closest('.pf-q').scrollIntoView({ block: 'center' });
      return;
    }
    const done = () => {
      root.innerHTML = `<div class="pf pf-done" tabindex="-1"><span class="pf-done-icon" aria-hidden="true">✓</span><h1>${h(form.title)}</h1><p>${h(form.confirmation)}</p><a class="btn" href="index.html">Back to the website</a></div>`;
      root.firstElementChild.focus();
      scrollTo({ top: 0 });
    };
    if (el.elements.pf_website.value) return done(); // automated sign-ups: nothing is stored
    button.disabled = true;
    button.textContent = 'Submitting…';
    status.textContent = '';
    try {
      await submit(id, answers);
      done();
    } catch (error) {
      status.textContent = error.status === 403 ? 'Your answers could not be accepted. The form may have just closed; reload the page to check.' : 'Your answers could not be sent. Check your connection and try again.';
      button.disabled = false;
      button.textContent = 'Submit';
    }
  });
}
start();
