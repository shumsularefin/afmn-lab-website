// Builds an editing form from a section description (schema.js) and keeps the edited value in memory.
// Lists open one item at a time (their fields are built when opened, so a list of 100 publications
// stays fast), can be searched, reordered with ↑ ↓, duplicated and removed.
import { h, $, $$, confirmDialog, slug, busy, toast } from './ui.js';
import { imageFieldHTML, wireImage, fileFieldHTML, wireFile } from './images.js';

const get = (obj, path) => path.split('.').filter(Boolean).reduce((o, k) => (o == null ? undefined : o[k]), obj);
function set(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) o = o[k] ??= {};
  o[keys.at(-1)] = value;
}
/** The field description at a value path such as "items.3.links.0.url". */
function fieldAt(fields, path) {
  let list = fields, field = null;
  for (const part of path.split('.')) {
    if (/^\d+$/.test(part)) continue;
    field = list.find((f) => f.key === part);
    if (!field) return null;
    list = field.fields || [];
  }
  return field;
}
/** Select options may be a list or a function (for choices that come from the database, such as forms). */
const optionsOf = (f) => (typeof f.options === 'function' ? f.options() : f.options);
export function defaultItem(fields) {
  const item = {};
  for (const f of fields)
    item[f.key] = f.default ?? (f.type === 'list' ? [] : f.type === 'checkbox' ? false : f.type === 'number' ? (f.key === 'year' ? new Date().getFullYear() : 0) : f.type === 'select' ? optionsOf(f)[0]?.[0] ?? '' : '');
  return item;
}

const strip = (s) => String(s ?? '').replace(/<[^>]+>/g, '');
const isLink = (v) => /^(https?:\/\/|mailto:|tel:)\S+$/i.test(v) || /^[\w\-./#?=&%]+$/.test(v);

/** The first problem in a value, as { path, message }, or null. */
export function validate(fields, value, base = '') {
  for (const f of fields) {
    const path = base + f.key;
    const v = value?.[f.key];
    const label = f.label.replace(/\s*\(.*\)$/, '');
    if (f.type === 'list') {
      for (const [i, item] of (v || []).entries()) {
        const problem = validate(f.fields, item, `${path}.${i}.`);
        if (problem) return { ...problem, message: `${f.itemLabel ? strip(f.itemLabel(item)) : `Item ${i + 1}`}: ${problem.message}` };
      }
      continue;
    }
    const empty = v === undefined || v === null || String(v).trim() === '';
    if (f.required && empty) return { path, message: `${label} is required.` };
    if (empty) continue;
    if (f.max && f.type !== 'number' && String(v).length > f.max) return { path, message: `${label} is too long (at most ${f.max} characters).` };
    if (f.type === 'number' && (!Number.isFinite(Number(v)) || (f.min !== undefined && v < f.min) || (f.max !== undefined && v > f.max)))
      return { path, message: `${label} must be a number between ${f.min ?? 0} and ${f.max}.` };
    if (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return { path, message: `${label} is not a valid email address.` };
    if ((f.type === 'url' || f.type === 'file') && !/^file:[a-f0-9-]{36}$/.test(String(v).trim()) && !isLink(String(v).trim())) return { path, message: `${label} must be a web address (https://…) or a page of this site.` };
    if (f.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return { path, message: `${label} is not a valid date.` };
  }
  return null;
}

function inputHTML(f, path, v) {
  const id = 'f-' + path.replace(/\W/g, '-');
  const common = `id="${id}" data-path="${h(path)}"${f.required ? ' aria-required="true"' : ''}`;
  const label = `<span class="ed-label">${h(f.label)}${f.required ? '' : ''}</span>`;
  const hint = f.hint ? `<small>${h(f.hint)}</small>` : '';
  const cls = `ed-field${f.half ? ' ed-half' : ''}`;
  switch (f.type) {
    case 'checkbox':
      return `<label class="ed-check ${f.half ? 'ed-half' : ''}"><input type="checkbox" ${common}${v ? ' checked' : ''}> <span>${h(f.label)}</span></label>`;
    case 'select':
      return `<label class="${cls}">${label}<select ${common}>${optionsOf(f).map(([o, t]) => `<option value="${h(o)}"${String(v ?? '') === o ? ' selected' : ''}>${h(t)}</option>`).join('')}</select>${hint}</label>`;
    case 'textarea':
    case 'rich':
    case 'lines':
      return `<label class="${cls} ed-wide">${label}<textarea ${common} rows="${f.rows || 3}">${h(v ?? '')}</textarea>${hint}${f.type === 'rich' ? '<div class="ed-rich-preview" aria-hidden="true"></div>' : ''}</label>`;
    case 'image':
      return imageFieldHTML(f, path, v);
    case 'file':
      return fileFieldHTML(f, path, v);
    case 'number':
      return `<label class="${cls}">${label}<input type="number" ${common} value="${h(v ?? '')}"${f.min !== undefined ? ` min="${f.min}"` : ''}${f.max !== undefined ? ` max="${f.max}"` : ''}>${hint}</label>`;
    default: {
      const type = { date: 'date', email: 'email' }[f.type] || 'text';
      const list = f.list ? `<datalist id="${id}-list">${f.list.map((o) => `<option value="${h(o)}">`).join('')}</datalist>` : '';
      const doi = f.key === 'url' && path.includes('.') && f.hint?.includes('DOI') ? '<button type="button" class="ed-btn ed-btn-small" data-doi>Fill in from DOI</button>' : '';
      return `<label class="${cls}">${label}<span class="ed-input-row"><input type="${type}" ${common} value="${h(v ?? '')}"${f.list ? ` list="${id}-list"` : ''}${f.type === 'url' ? ' inputmode="url"' : ''}>${doi}</span>${list}${hint}</label>`;
    }
  }
}

function listHTML(f, path, items = []) {
  const tools = f.search && items.length > 6 ? `<input type="search" class="ed-list-search" data-search="${h(path)}" placeholder="Search ${h(f.label.toLowerCase())}…" aria-label="Search ${h(f.label)}">` : '';
  const add = `<button type="button" class="ed-btn ed-btn-small" data-add="${h(path)}">+ ${h(f.addLabel || 'Add')}</button>`;
  return `<fieldset class="ed-list-field" data-list="${h(path)}"><legend>${h(f.label)} <span class="ed-count">${items.length}</span></legend>
    ${f.hint ? `<small class="ed-list-hint">${h(f.hint)}</small>` : ''}
    <div class="ed-list-tools">${tools}${f.addAt === 'top' || items.length > 6 ? add : ''}</div>
    ${items.length ? '' : `<p class="ed-muted">${h(f.empty || 'Nothing here yet.')}</p>`}
    <ol class="ed-items">${items.map((item, i) => itemHTML(f, `${path}.${i}`, item, i, items.length)).join('')}</ol>
    ${f.addAt === 'top' && items.length <= 6 ? '' : `<div class="ed-list-tools">${add}</div>`}
  </fieldset>`;
}
function itemHTML(f, path, item, i, n) {
  const tag = f.itemTag?.(item) || '';
  return `<li><details data-item="${h(path)}"><summary><span class="ed-item-title">${h(strip(f.itemLabel ? f.itemLabel(item) : `Item ${i + 1}`))}</span>${tag ? `<span class="ed-tag">${h(tag)}</span>` : ''}
    <span class="ed-item-tools"><button type="button" class="ed-icon-btn" data-move="-1" data-at="${h(path)}" aria-label="Move up"${i === 0 ? ' disabled' : ''}>↑</button><button type="button" class="ed-icon-btn" data-move="1" data-at="${h(path)}" aria-label="Move down"${i === n - 1 ? ' disabled' : ''}>↓</button><button type="button" class="ed-icon-btn" data-dup="${h(path)}" aria-label="Duplicate" title="Duplicate">⧉</button><button type="button" class="ed-icon-btn ed-icon-danger" data-remove="${h(path)}" aria-label="Remove" title="Remove">×</button></span></summary>
    <div class="ed-item-body"></div></details></li>`;
}
export function fieldsHTML(fields, value, base = '') {
  return `<div class="ed-grid">${fields.map((f) => (f.type === 'list' ? listHTML(f, base + f.key, value?.[f.key] || []) : inputHTML(f, base + f.key, value?.[f.key]))).join('')}</div>`;
}

/**
 * Renders the form into root. onChange(value) runs after every edit with the full current value.
 * Returns { value(), focusProblem(problem) }.
 */
export function createForm(root, fields, initial, { app, onChange }) {
  const state = structuredClone(initial);
  const open = new Set();
  const changed = () => onChange(state);

  function fillItem(details) {
    const body = $('.ed-item-body', details);
    if (body.childElementCount) return;
    const path = details.dataset.item;
    const f = fieldAt(fields, path);
    body.innerHTML = fieldsHTML(f.fields, get(state, path), path + '.');
    afterRender(body);
  }
  function afterRender(scope) {
    for (const box of $$('[data-image]', scope)) wireImage(box, app, (ref) => setPath(box.dataset.image, ref));
    for (const box of root.querySelectorAll('[data-file]')) if (scope.contains(box) && !box.dataset.wired) { box.dataset.wired = '1'; wireFile(box, app, (ref) => setPath(box.dataset.file, ref)); }
    for (const t of $$('textarea', scope)) richPreview(t);
    for (const d of $$('details[data-item]', scope)) if (open.has(d.dataset.item) && !d.open) { d.open = true; fillItem(d); }
  }
  function render() {
    const y = window.scrollY;
    root.innerHTML = fieldsHTML(fields, state);
    afterRender(root);
    window.scrollTo(0, y);
  }
  function setPath(path, value) {
    const f = fieldAt(fields, path);
    const parent = path.split('.').slice(0, -1).join('.');
    const old = get(state, path);
    set(state, path, value);
    // Fill a "web address part" from the title until someone edits it.
    const container = parent ? fieldAt(fields, parent.replace(/\.\d+$/, '')) : null;
    for (const s of (container?.fields || fields).filter((x) => x.type === 'slug' && x.from === f?.key)) {
      const sp = (parent ? parent + '.' : '') + s.key;
      const cur = get(state, sp);
      if (!cur || cur === slug(strip(old))) {
        set(state, sp, slug(strip(value)));
        const input = root.querySelector(`[data-path="${CSS.escape(sp)}"]`);
        if (input) input.value = get(state, sp);
      }
    }
    // Keep the summary line of the item up to date.
    const details = root.querySelector(`details[data-item="${CSS.escape(parent)}"]`);
    const listField = parent ? fieldAt(fields, parent.replace(/\.\d+$/, '')) : null;
    if (details && listField?.itemLabel) {
      const item = get(state, parent);
      $('.ed-item-title', details).textContent = strip(listField.itemLabel(item));
      const tag = listField.itemTag?.(item) || '';
      const tagEl = $('summary > .ed-tag', details);
      if (tagEl) tagEl.textContent = tag;
      else if (tag) $('.ed-item-title', details).insertAdjacentHTML('afterend', `<span class="ed-tag">${h(tag)}</span>`);
    }
    changed();
  }
  function richPreview(t) {
    const box = t.parentElement.querySelector('.ed-rich-preview');
    if (!box) return;
    const show = /\*|\[|_\{|\^\{|</.test(t.value);
    box.hidden = !show;
    if (show) box.innerHTML = window.LAB.paras(t.value);
  }

  root.addEventListener('input', (e) => {
    const el = e.target.closest('[data-path]');
    if (el) {
      const f = fieldAt(fields, el.dataset.path);
      const v = el.type === 'checkbox' ? el.checked : f?.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value;
      setPath(el.dataset.path, v);
      if (el.tagName === 'TEXTAREA') richPreview(el);
    }
    const search = e.target.closest('[data-search]');
    if (search) {
      const q = search.value.trim().toLowerCase();
      const list = search.closest('[data-list]');
      for (const li of $$(':scope > .ed-items > li', list)) {
        const item = get(state, $('details', li).dataset.item);
        li.hidden = q && !JSON.stringify(item).toLowerCase().includes(q);
      }
    }
  });
  root.addEventListener('toggle', (e) => {
    const d = e.target;
    if (!d.matches?.('details[data-item]')) return;
    if (d.open) { open.add(d.dataset.item); fillItem(d); } else open.delete(d.dataset.item);
  }, true);
  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn || !root.contains(btn)) return;
    if (btn.closest('summary')) e.preventDefault();
    if (btn.dataset.add) {
      const f = fieldAt(fields, btn.dataset.add);
      const list = get(state, btn.dataset.add) || [];
      const item = defaultItem(f.fields);
      const top = f.addAt === 'top';
      if (top) list.unshift(item); else list.push(item);
      set(state, btn.dataset.add, list);
      shiftOpen(btn.dataset.add, top ? 0 : list.length - 1, 1);
      open.add(`${btn.dataset.add}.${top ? 0 : list.length - 1}`);
      render();
      changed();
      const d = root.querySelector(`details[data-item="${CSS.escape(`${btn.dataset.add}.${top ? 0 : list.length - 1}`)}"]`);
      d?.scrollIntoView({ block: 'center' });
      $('input, textarea, select', d)?.focus({ preventScroll: true });
    } else if (btn.dataset.move) {
      const [listPath, i] = splitItem(btn.dataset.at);
      const list = get(state, listPath), j = i + Number(btn.dataset.move);
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      const wasI = open.has(`${listPath}.${i}`), wasJ = open.has(`${listPath}.${j}`);
      open.delete(`${listPath}.${i}`); open.delete(`${listPath}.${j}`);
      if (wasI) open.add(`${listPath}.${j}`);
      if (wasJ) open.add(`${listPath}.${i}`);
      render();
      changed();
      root.querySelector(`[data-at="${CSS.escape(`${listPath}.${j}`)}"][data-move="${btn.dataset.move}"]`)?.focus();
    } else if (btn.dataset.dup) {
      const [listPath, i] = splitItem(btn.dataset.dup);
      const list = get(state, listPath);
      list.splice(i + 1, 0, structuredClone(list[i]));
      shiftOpen(listPath, i + 1, 1);
      open.add(`${listPath}.${i + 1}`);
      render();
      changed();
    } else if (btn.dataset.remove) {
      const [listPath, i] = splitItem(btn.dataset.remove);
      const f = fieldAt(fields, listPath);
      const list = get(state, listPath);
      const name = strip(f.itemLabel ? f.itemLabel(list[i]) : 'this item');
      if (!(await confirmDialog({ title: `Remove “${name}”?`, body: '<p>It disappears from the website when you publish this section. Until then you can discard the draft to get it back.</p>', confirm: 'Remove', danger: true }))) return;
      list.splice(i, 1);
      open.delete(`${listPath}.${i}`);
      shiftOpen(listPath, i, -1);
      render();
      changed();
    } else if ('doi' in btn.dataset) {
      const input = btn.parentElement.querySelector('input');
      await busy(btn, 'Looking up…', () => fillFromDOI(input.dataset.path, input.value));
    }
  });
  const splitItem = (p) => { const parts = p.split('.'); return [parts.slice(0, -1).join('.'), Number(parts.at(-1))]; };
  function shiftOpen(listPath, from, by) {
    const moved = [...open].filter((p) => p.startsWith(listPath + '.')).map((p) => [p, Number(p.slice(listPath.length + 1).split('.')[0])]).filter(([, n]) => n >= from);
    for (const [p] of moved) open.delete(p);
    for (const [p, n] of moved) open.add(`${listPath}.${n + by}${p.slice(listPath.length + 1 + String(n).length)}`);
  }

  async function fillFromDOI(urlPath, raw) {
    const doi = String(raw || '').trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
    if (!/^10\.\d{4,9}\/\S+$/.test(doi)) throw Error('Enter a DOI such as 10.1039/d5ra08641h first.');
    const r = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
    if (!r.ok) throw Error('Crossref does not know this DOI. Check it and try again.');
    const m = (await r.json()).message;
    const base = urlPath.split('.').slice(0, -1).join('.');
    const authors = (m.author || []).map((a) => `${(a.given || '').split(/[\s-]+/).filter(Boolean).map((p) => p[0] + '.').join('')} ${a.family || a.name || ''}`.trim());
    const year = (m.issued?.['date-parts']?.[0]?.[0]) || (m['published-print'] || m['published-online'])?.['date-parts']?.[0]?.[0];
    const venue = [m['container-title']?.[0], [m.volume && (m.issue ? `${m.volume}(${m.issue})` : m.volume), m.page || m['article-number']].filter(Boolean).join(', ')].filter(Boolean).join(' ');
    const type = /chapter/.test(m.type) ? 'c' : /proceedings/.test(m.type) ? 'a' : /review/i.test(m.title?.[0] || '') ? 'r' : 'j';
    const values = {
      url: `https://doi.org/${doi}`,
      title: strip(m.title?.[0] || '').replace(/\s+/g, ' '),
      authors: authors.length > 8 ? authors.slice(0, 7).join(', ') + ', et al.' : authors.join(', '),
      venue,
      year: year || new Date().getFullYear(),
      type,
    };
    for (const [k, v] of Object.entries(values)) if (v) set(state, `${base}.${k}`, v);
    open.add(base);
    render();
    changed();
    toast('Filled in from Crossref. Check the details before publishing.');
  }

  render();
  return {
    value: () => state,
    focusProblem(problem, message) {
      const parts = problem.path.split('.');
      for (let i = 1; i < parts.length; i++) if (/^\d+$/.test(parts[i])) open.add(parts.slice(0, i + 1).join('.'));
      render();
      const el = root.querySelector(`[data-path="${CSS.escape(problem.path)}"], [data-image="${CSS.escape(problem.path)}"]`);
      if (el) {
        el.setAttribute('aria-invalid', 'true');
        el.closest('label, .ed-field')?.insertAdjacentHTML('beforeend', `<span class="ed-error-text" role="alert">${h(message || problem.message)}</span>`);
        el.scrollIntoView({ block: 'center' });
        el.focus?.({ preventScroll: true });
      }
    },
  };
}
