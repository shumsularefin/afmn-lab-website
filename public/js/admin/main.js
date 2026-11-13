// Lab Dashboard: sign-in, navigation, drafts, publishing and the views.
// Structure follows the ACS GSTU Chapter Editor: Google sign-in only, roles granted by the super-admin,
// every section saved as a draft in this browser and published on its own, with conflict checks.
import { connect, ConflictError, permissions, roleInfo, OWNER_EMAIL } from './cloud.js';
import { createDrafts } from './drafts.js';
import { SECTIONS, sectionById } from './schema.js';
import { createForm, validate } from './form.js';
import { chooseImage, openDocument } from './images.js';
import { formsView } from './forms-view.js';
import { $, $$, h, toast, confirmDialog, openDialog, errorMessage, busy, when, clock, download, field, select, formValues } from './ui.js';

const LAB = window.LAB;
const app = { config: null, cloud: null, user: null, role: '', perms: permissions(''), data: null, drafts: null, route: { view: 'overview', params: [] } };
window.labDashboard = app; // Handy when debugging in the browser console.

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
app.sectionTitle = (id) => sectionById[id]?.title || id;
/** The live value of a section: published, or the site's defaults when it was never published. */
app.live = (id) => {
  const s = app.data.sections[id];
  return s ? { ...LAB.DEFAULTS[id], ...s.value } : structuredClone(LAB.DEFAULTS[id]);
};
app.revision = (id) => app.data.sections[id]?.revision || 0;
const draftName = (id) => `content:${id}`;

// ------------------------------------------------------------------ publishing

/** Validates a section value and returns what will be written. Throws { problem }. */
function prepare(id, value) {
  const problem = validate(sectionById[id].fields, value);
  if (problem) throw Object.assign(Error(problem.message), { problem });
  const out = structuredClone(value);
  delete out.fresh;
  // Publications and News remember which Google Scholar suggestions were handled.
  if (id === 'publications') out.seen = [...new Set([...(out.seen || []), ...(out.items || []).map(LAB.pubKey)])];
  if (id === 'news') out.seen = [...new Set([...(out.seen || []), ...(out.items || []).map(LAB.newsKey)])];
  return out;
}

app.publish = async (id, { reload = true, quiet = false } = {}) => {
  const name = draftName(id);
  const draft = app.drafts.get(name);
  if (!draft) return true;
  let value;
  try {
    value = prepare(id, draft.value);
  } catch (error) {
    if (!error.problem) throw error;
    showProblem(id, error.problem);
    return false;
  }
  try {
    await app.cloud.saveSection(id, value, draft.baseRevision);
  } catch (error) {
    if (!(error instanceof ConflictError)) throw error;
    const choice = await openDialog(
      `<h2>Someone else changed ${h(app.sectionTitle(id))}</h2><div class="ed-dialog-body"><p>Another editor published this section after you started your draft.</p><p><strong>Publish mine</strong> replaces their version with yours. <strong>Use theirs</strong> discards your draft and loads the live version.</p></div><div class="ed-actions"><button type="button" class="ed-btn ed-btn-quiet" data-close>Cancel</button><button type="button" class="ed-btn" data-choice="theirs">Use theirs</button><button type="button" class="ed-btn ed-btn-primary" data-choice="mine">Publish mine</button></div>`,
      (dialog, close) => dialog.addEventListener('click', (e) => e.target.dataset.choice && close(e.target.dataset.choice)),
    );
    if (choice === 'theirs') {
      app.drafts.remove(name);
      await app.reload();
      toast(`Loaded the live version of ${app.sectionTitle(id)}.`, { type: 'info' });
      return false;
    }
    if (choice !== 'mine') return false;
    await app.cloud.saveSection(id, value, error.revision);
  }
  app.drafts.remove(name);
  if (reload) await app.reload();
  if (!quiet) toast(`${app.sectionTitle(id)} is live. Visitors see it now; the fast copy of the site catches up within about 30 minutes.`);
  return true;
};

app.publishAll = async () => {
  const ids = app.drafts.names().map((n) => n.split(':')[1]).filter((id) => app.perms.section(id));
  if (!ids.length) return;
  const ok = await confirmDialog({
    title: `Publish ${ids.length} section${ids.length === 1 ? '' : 's'}?`,
    body: `<p>These drafts will go live on the website:</p><ul>${ids.map((id) => `<li>${h(app.sectionTitle(id))}</li>`).join('')}</ul>`,
    confirm: 'Publish now',
  });
  if (!ok) return;
  const done = [];
  for (const id of ids) {
    try {
      if (await app.publish(id, { reload: false, quiet: true })) done.push(app.sectionTitle(id));
      else break; // The section with the problem is open now.
    } catch (error) {
      toast(`${app.sectionTitle(id)}: ${errorMessage(error)}`, { type: 'error' });
      break;
    }
  }
  await app.reload();
  if (done.length) toast(`Published: ${done.join(', ')}.`);
};

app.discard = async (id) => {
  if (!(await confirmDialog({ title: 'Discard this draft?', body: `<p>Your unpublished changes to ${h(app.sectionTitle(id))} will be removed. The live website does not change.</p>`, confirm: 'Discard draft', danger: true }))) return false;
  app.drafts.remove(draftName(id));
  render();
  toast('Draft discarded.', { type: 'info' });
  return true;
};

function showProblem(id, problem) {
  navigate('section', [id]);
  app.form?.focusProblem(problem);
  toast(`${app.sectionTitle(id)}: ${problem.message}`, { type: 'error' });
}

/** Opens the public page with every draft applied (only in this browser). */
app.preview = (page) => {
  const preview = {};
  for (const n of app.drafts.names()) preview[n.split(':')[1]] = app.drafts.get(n).value;
  try {
    localStorage.setItem('afmn-preview', JSON.stringify(preview));
  } catch {
    toast('This browser cannot store the preview (private window?).', { type: 'error' });
    return;
  }
  const [path, hash] = page.split('#');
  window.open(`${path}?preview=1${hash ? '#' + hash : ''}`, '_blank', 'noopener');
};

app.reload = async () => {
  app.data = await app.cloud.load();
  render();
};

// ------------------------------------------------------------------ views

const statusHTML = (id) => {
  const draft = app.drafts.get(draftName(id));
  const live = app.data.sections[id];
  const state = draft
    ? `<span class="ed-chip ed-chip-draft">Draft saved ${h(clock(new Date(draft.savedAt)))} · not live yet</span>`
    : live
      ? `<span class="ed-chip ed-chip-live">Live · published ${h(when(live.updatedAt))}${live.updatedBy ? ' by ' + h(live.updatedBy) : ''}</span>`
      : '<span class="ed-chip">Showing the original website content · edit to change it</span>';
  return `${state}<div class="ed-actions"><button type="button" class="ed-btn ed-btn-quiet ed-btn-small" data-preview>Preview</button>${draft ? '<button type="button" class="ed-btn ed-btn-quiet ed-btn-small" data-discard>Discard draft</button>' : ''}<button type="button" class="ed-btn ed-btn-primary" data-publish${draft ? '' : ' disabled'}>Publish</button></div>`;
};

function scholarBox(id, value, onAdd) {
  const fresh = id === 'publications' ? LAB.unseenPublications(value) : id === 'news' ? LAB.unseenNews(value) : [];
  if (!fresh.length) return '';
  const label = (x) => (id === 'publications' ? `${x.year} · ${LAB.stripTags(x.title)} — ${LAB.stripTags(x.venue)}` : `${x.date} · ${LAB.stripTags(x.text)}`);
  return `<section class="ed-card ed-card-attention" data-fresh><div class="ed-card-head"><h3>New from Google Scholar (${fresh.length})</h3><div class="ed-actions"><button type="button" class="ed-btn ed-btn-small ed-btn-primary" data-fresh-all>Add all</button></div></div>
    <p>The automatic Google Scholar update found these. They already show on the website; add them to the list to edit them, or dismiss the ones you do not want shown.</p>
    <ul class="ed-list">${fresh.map((x, i) => `<li><span>${h(label(x))}</span><div class="ed-actions"><button type="button" class="ed-btn ed-btn-small" data-fresh-add="${i}">Add to list</button><button type="button" class="ed-btn ed-btn-small ed-btn-quiet" data-fresh-dismiss="${i}">Dismiss</button></div></li>`).join('')}</ul></section>`;
}

const sectionView = {
  id: 'section',
  render(root, [id]) {
    const s = sectionById[id];
    if (!s || !app.perms.section(id)) return navigate('overview');
    const name = draftName(id);
    const live = app.live(id);
    const base = app.drafts.get(name)?.value || live;
    root.innerHTML = `<p class="ed-intro">${h(s.intro)} <a href="${h(s.page)}" target="_blank" rel="noopener">View this page ↗</a></p>
      <div class="ed-status" data-status>${statusHTML(id)}</div>
      <div data-fresh-box></div>
      <form class="ed-card ed-form" novalidate data-form></form>
      <div class="ed-status ed-status-bottom" data-status>${statusHTML(id)}</div>`;
    const refreshStatus = () => $$('[data-status]', root).forEach((el) => (el.innerHTML = statusHTML(id)));
    const save = (value) => {
      if (same(value, live)) app.drafts.remove(name);
      else app.drafts.set(name, structuredClone(value), app.drafts.get(name)?.baseRevision ?? app.revision(id));
      refreshStatus();
    };
    const form = createForm($('[data-form]', root), s.fields, base, { app, onChange: save });
    app.form = form;
    const drawFresh = () => ($('[data-fresh-box]', root).innerHTML = scholarBox(id, form.value()));
    drawFresh();
    root.addEventListener('click', async (e) => {
      const t = e.target.closest('button');
      if (!t) return;
      if ('publish' in t.dataset) await busy(t, 'Publishing…', () => app.publish(id));
      else if ('discard' in t.dataset) await app.discard(id);
      else if ('preview' in t.dataset) app.preview(s.page);
      else if (t.closest('[data-fresh]')) {
        const v = form.value();
        const fresh = id === 'publications' ? LAB.unseenPublications(v) : LAB.unseenNews(v);
        const key = id === 'publications' ? LAB.pubKey : LAB.newsKey;
        const pick = 'freshAll' in t.dataset ? fresh : [fresh[Number(t.dataset.freshAdd ?? t.dataset.freshDismiss)]];
        const add = !('freshDismiss' in t.dataset);
        v.seen = [...new Set([...(v.seen || []), ...pick.map(key)])];
        if (add) v.items = [...pick.map((x) => structuredClone(x)), ...(v.items || [])];
        app.drafts.set(name, structuredClone(v), app.drafts.get(name)?.baseRevision ?? app.revision(id));
        render();
        toast(add ? `Added ${pick.length} to the draft. Publish to keep them.` : 'Dismissed. Publish to hide it from the website.', { type: 'info' });
      }
    });
  },
};

const overviewView = {
  id: 'overview',
  title: 'Overview',
  icon: '◉',
  render(root) {
    const meta = app.data.meta;
    const allowed = SECTIONS.filter((s) => app.perms.section(s.id));
    const open = (LAB.DEFAULTS && app.live('openings').positions || []).filter((p) => p.status !== 'closed' && (!p.deadline || p.deadline >= new Date().toISOString().slice(0, 10))).length;
    root.innerHTML = `
      <section class="ed-card ed-welcome"><h3>Welcome, ${h(app.user.displayName || app.user.email)}</h3>
        <p>You are signed in as <strong>${h(roleInfo[app.role].label)}</strong>: ${h(roleInfo[app.role].summary)}</p>
        <ol class="ed-howto"><li><strong>Edit</strong> a section. Changes are saved as a draft in this browser as you type.</li><li><strong>Preview</strong> shows the website with your drafts, only to you.</li><li><strong>Publish</strong> makes the section live for every visitor at once.</li></ol>
        <p class="ed-muted">${meta ? `Last published ${h(when(meta.updatedAt))}${meta.updatedByEmail ? ' by ' + h(meta.updatedByEmail) : ''} (${h(app.sectionTitle(meta.section || ''))}). Website revision ${meta.revision}.` : 'Nothing has been published from the dashboard yet; the website shows its original content. Each section starts from that content.'}</p></section>
      <div class="ed-stats">
        <div class="ed-stat"><b>${app.live('team').members.filter((m) => m.group === 'current').length}</b><span>Current members</span></div>
        <div class="ed-stat"><b>${LAB.resolve({ publications: app.live('publications') }).publications.items.length}</b><span>Publications</span></div>
        <div class="ed-stat"><b>${app.live('news').items.length}</b><span>News items</span></div>
        <div class="ed-stat"><b>${open}</b><span>Open positions</span></div>
        <div class="ed-stat"><b>${app.live('gallery').photos.length}</b><span>Gallery photos</span></div>
      </div>
      <div class="ed-quick">${allowed
        .map((s) => {
          const d = app.drafts.get(draftName(s.id));
          const live = app.data.sections[s.id];
          return `<a class="ed-quick-card" href="#section/${s.id}"><span class="ed-nav-icon" aria-hidden="true">${s.icon}</span><strong>${h(s.title)}</strong><small>${h(s.intro)}</small><span class="ed-chip ${d ? 'ed-chip-draft' : live ? 'ed-chip-live' : ''}">${d ? 'Unpublished draft' : live ? `Updated ${h(when(live.updatedAt))}` : 'Original content'}</span></a>`;
        })
        .join('')}</div>
      ${app.perms.activity ? '<section class="ed-card"><div class="ed-card-head"><h3>Recent activity</h3><a href="#editors">All activity</a></div><div data-recent><p class="ed-muted">Loading…</p></div></section>' : ''}`;
    if (app.perms.activity)
      app.cloud.activity().then(({ entries }) => {
        const box = $('[data-recent]', root);
        if (box) box.innerHTML = entries.length ? `<ul class="ed-list">${entries.slice(0, 8).map((e) => `<li><span>${h(when(e.createdAt))} · ${h(e.actorEmail)} · ${h(ACTIONS[e.action] || e.action)} <em>${h(app.sectionTitle(e.target))}</em></span></li>`).join('')}</ul>` : '<p class="ed-muted">No activity yet.</p>';
      }).catch(() => {});
  },
};

const ACTIONS = { 'content.update': 'Published', 'image.add': 'Uploaded image', 'image.delete': 'Deleted image', 'file.add': 'Uploaded document', 'file.delete': 'Deleted document', 'form.create': 'Created form', 'form.update': 'Saved form', 'form.delete': 'Deleted form', 'form.responses.delete': 'Deleted responses of form', 'access.set': 'Changed access for', 'access.delete': 'Removed editor' };

const libraryView = {
  id: 'images',
  title: 'Image library',
  icon: '🗂',
  render(root) {
    root.innerHTML = '<section class="ed-card"><p>Every image uploaded through the dashboard, where it is used, and who uploaded it. Images in use cannot be deleted. Uploads are resized and compressed automatically, so photos straight from a phone are fine.</p><button type="button" class="ed-btn ed-btn-primary" data-open>Open the image library</button></section><section class="ed-card"><div class="ed-card-head"><h3>Uploaded documents (PDF)</h3></div><p>Documents such as the CV. Upload a new CV under <a href="#section/pi">Principal Investigator</a>; old versions can be deleted here once nothing uses them.</p><div data-docs><p class="ed-muted">Loading…</p></div></section>';
    $('[data-open]', root).addEventListener('click', () => chooseImage(app, '', { manage: true }));
    const docsBox = $('[data-docs]', root);
    const drawDocs = async () => {
      const docs = (await app.cloud.documents()).sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
      const used = JSON.stringify([app.data.sections, app.drafts.all()]);
      docsBox.innerHTML = docs.length
        ? `<ul class="ed-list">${docs.map((d) => `<li class="ed-doc"><span><strong>${h(d.name)}</strong> · ${Math.round(d.size / 1024)} KB · ${h(when(d.createdAt))} · ${used.includes(d.reference) ? 'In use' : 'Not used'}</span><div class="ed-actions"><button type="button" class="ed-btn ed-btn-small" data-open-doc="${h(d.reference)}">Open</button>${!used.includes(d.reference) && (app.perms.deleteAnyImage || d.createdBy === app.user.uid) ? `<button type="button" class="ed-btn ed-btn-small ed-btn-danger-quiet" data-del-doc="${h(d.id)}" data-name="${h(d.name)}">Delete</button>` : ''}</div></li>`).join('')}</ul>`
        : '<p class="ed-muted">No documents uploaded yet.</p>';
    };
    busy(null, '', drawDocs);
    docsBox.addEventListener('click', async (e) => {
      const o = e.target.closest('[data-open-doc]');
      if (o) await busy(o, 'Opening…', () => openDocument(app, o.dataset.openDoc));
      const d = e.target.closest('[data-del-doc]');
      if (d && (await confirmDialog({ title: `Delete ${d.dataset.name}?`, body: '<p>It is removed for good.</p>', confirm: 'Delete', danger: true })))
        await busy(d, 'Deleting…', async () => { await app.cloud.deleteDocument(d.dataset.delDoc, d.dataset.name); toast('Document deleted.'); await drawDocs(); });
    });
  },
};

const editorsView = {
  id: 'editors',
  title: 'Editors & activity',
  icon: '⚑',
  allowed: (p) => p.editors,
  render(root) {
    root.innerHTML = `
      <section class="ed-card"><div class="ed-card-head"><h3>Who can edit the website</h3></div>
        <p>People sign in with their own Google account. Give each person the smallest role they need, and disable access when they leave the lab.</p>
        <dl class="ed-roles">${Object.values(roleInfo).map((r) => `<div><dt>${h(r.label)}</dt><dd>${h(r.summary)}</dd></div>`).join('')}</dl>
        <form class="ed-inline-form" data-editor-form novalidate>
          ${field({ label: 'Google account email', name: 'email', type: 'email', attrs: 'required maxlength="200" autocomplete="off"' })}
          ${field({ label: 'Name', name: 'name', optional: true, attrs: 'maxlength="100"' })}
          ${select({ label: 'Role', name: 'role', options: Object.entries(roleInfo).map(([id, r]) => [id, r.label]), value: 'contributor' })}
          ${select({ label: 'Access', name: 'active', options: [['true', 'Active'], ['false', 'Disabled']] })}
          <button type="submit" class="ed-btn ed-btn-primary">Save access</button>
        </form>
        <div class="ed-table-wrap" data-editors><p class="ed-muted">Loading editors…</p></div></section>
      <section class="ed-card"><div class="ed-card-head"><h3>Activity log</h3><button type="button" class="ed-btn ed-btn-small ed-btn-quiet" data-refresh>Refresh</button></div>
        <p>Every change is recorded with the editor’s account and the server time. Entries cannot be edited or deleted.</p>
        <label class="ed-field"><span class="ed-label">Filter</span><input type="search" data-filter placeholder="Editor, action or section"></label>
        <div class="ed-table-wrap"><table class="ed-table"><thead><tr><th>When</th><th>Editor</th><th>What</th><th>Details</th></tr></thead><tbody data-log></tbody></table></div>
        <button type="button" class="ed-btn ed-btn-quiet" data-older hidden>Show older activity</button></section>`;
    const form = $('[data-editor-form]', root);
    let editors = [];
    async function loadEditors() {
      editors = await app.cloud.editors();
      const list = [{ email: OWNER_EMAIL, role: 'super-admin', active: true, permanent: true }, ...editors.filter((e) => e.email !== OWNER_EMAIL)];
      $('[data-editors]', root).innerHTML = `<table class="ed-table"><thead><tr><th>Account</th><th>Role</th><th>Status</th><th>Last change</th><th><span class="ed-sr">Actions</span></th></tr></thead><tbody>${list
        .map((e) => `<tr><td>${h(e.email)}${e.name ? `<br><small>${h(e.name)}</small>` : ''}</td><td>${h(roleInfo[e.role]?.label || e.role)}</td><td><span class="ed-tag ${e.active ? 'ed-tag-open' : ''}">${e.active ? 'Active' : 'Disabled'}</span></td><td>${e.permanent ? 'Permanent owner' : h(when(e.updatedAt))}</td><td>${e.permanent ? '' : `<div class="ed-actions"><button type="button" class="ed-btn ed-btn-small" data-edit="${h(e.email)}">Edit</button><button type="button" class="ed-btn ed-btn-small ed-btn-danger-quiet" data-remove="${h(e.email)}">Remove</button></div>`}</td></tr>`)
        .join('')}</tbody></table>`;
    }
    let cursor = null;
    const log = $('[data-log]', root);
    async function loadActivity(older = false) {
      const page = await app.cloud.activity(older ? cursor : null);
      cursor = page.cursor;
      const rows = page.entries.map((e) => `<tr data-text="${h(`${e.actorEmail} ${e.action} ${e.target} ${app.sectionTitle(e.target)} ${e.detail}`.toLowerCase())}"><td>${h(when(e.createdAt))}</td><td>${h(e.actorEmail)}</td><td>${h(ACTIONS[e.action] || e.action)}<br><small class="ed-mono">${h(app.sectionTitle(e.target))}</small></td><td>${h(e.detail)}</td></tr>`).join('');
      if (older) log.insertAdjacentHTML('beforeend', rows);
      else log.innerHTML = rows || '<tr><td colspan="4">No activity yet.</td></tr>';
      $('[data-older]', root).hidden = page.entries.length < 50;
      applyFilter();
    }
    const applyFilter = () => {
      const q = $('[data-filter]', root).value.trim().toLowerCase();
      for (const row of $$('tr[data-text]', log)) row.hidden = q && !row.dataset.text.includes(q);
    };
    busy(null, '', () => Promise.all([loadEditors(), loadActivity()]));
    $('[data-filter]', root).addEventListener('input', applyFilter);
    $('[data-refresh]', root).addEventListener('click', (e) => busy(e.currentTarget, 'Refreshing…', () => loadActivity()));
    $('[data-older]', root).addEventListener('click', (e) => busy(e.currentTarget, 'Loading…', () => loadActivity(true)));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = formValues(form);
      busy($('button[type="submit"]', form), 'Saving…', async () => {
        await app.cloud.setEditor(v.email, v.role, v.active === 'true', v.name);
        toast(`${v.email.trim().toLowerCase()} is now ${v.active === 'true' ? roleInfo[v.role].label.toLowerCase() : 'disabled'}.`);
        form.reset();
        await Promise.all([loadEditors(), loadActivity()]);
      });
    });
    $('[data-editors]', root).addEventListener('click', async (e) => {
      const edit = e.target.closest('[data-edit]');
      const remove = e.target.closest('[data-remove]');
      if (edit) {
        const r = editors.find((x) => x.email === edit.dataset.edit);
        form.elements.email.value = r.email;
        form.elements.name.value = r.name || '';
        form.elements.role.value = r.role;
        form.elements.active.value = String(r.active);
        form.elements.role.focus();
      }
      if (remove) {
        const email = remove.dataset.remove;
        if (!(await confirmDialog({ title: `Remove ${email}?`, body: '<p>They lose dashboard access immediately. Their past activity stays in the log.</p>', confirm: 'Remove access', danger: true }))) return;
        await busy(remove, 'Removing…', async () => {
          await app.cloud.deleteEditor(email);
          toast(`${email} removed.`);
          await Promise.all([loadEditors(), loadActivity()]);
        });
      }
    });
  },
};

const backupsView = {
  id: 'backups',
  title: 'Backups',
  icon: '⤓',
  allowed: (p) => p.backups,
  render(root) {
    root.innerHTML = `
      <section class="ed-card"><h3>Download a backup</h3><p>All website content as one file (images are referenced, not included). Keep a copy before large changes.</p>
        <button type="button" class="ed-btn ed-btn-primary" data-download>Download backup (JSON)</button></section>
      <section class="ed-card"><h3>Restore a backup</h3><p>Loads the sections from a backup file as <strong>drafts</strong>. Review them, then publish; nothing changes on the website before that.</p>
        <input type="file" accept="application/json,.json" data-restore aria-label="Backup file"></section>`;
    $('[data-download]', root).addEventListener('click', () => {
      const sections = Object.fromEntries(SECTIONS.map((s) => [s.id, app.live(s.id)]));
      download(`afmn-lab-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ kind: 'afmn-lab-backup', exportedAt: new Date().toISOString(), revision: app.data.revision, sections }, null, 2), 'application/json');
    });
    $('[data-restore]', root).addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        const backup = JSON.parse(await file.text());
        if (backup.kind !== 'afmn-lab-backup' || typeof backup.sections !== 'object') throw Error('This is not an AFMN Lab backup file.');
        let n = 0;
        for (const [id, value] of Object.entries(backup.sections)) {
          if (!sectionById[id] || same(value, app.live(id))) continue;
          app.drafts.set(draftName(id), value, app.revision(id));
          n++;
        }
        render();
        toast(n ? `Loaded ${n} section${n === 1 ? '' : 's'} as drafts. Review and publish them.` : 'The backup matches the live website; nothing to restore.', { type: 'info' });
      } catch (error) {
        toast(errorMessage(error), { type: 'error' });
      }
    });
  },
};

const accountView = {
  id: 'account',
  title: 'Your account',
  icon: '☺',
  render(root) {
    const p = app.perms;
    root.innerHTML = `<section class="ed-card"><h3>${h(app.user.displayName || app.user.email)}</h3><p>${h(app.user.email)} · <strong>${h(roleInfo[app.role].label)}</strong></p><p>${h(roleInfo[app.role].summary)}</p>
      <p>You can edit: ${SECTIONS.filter((s) => p.section(s.id)).map((s) => h(s.title)).join(', ')}.</p>
      <p class="ed-muted">Drafts are kept in this browser only. Signing out keeps them for your next visit here; publish before switching computers.</p>
      <button type="button" class="ed-btn" data-signout>Sign out</button></section>`;
    $('[data-signout]', root).addEventListener('click', signOut);
  },
};

const views = [overviewView, formsView, libraryView, editorsView, backupsView, accountView];

// ------------------------------------------------------------------ navigation and rendering

function navigate(view, params = []) {
  const target = '#' + [view, ...params].map(encodeURIComponent).join('/');
  if (location.hash !== target) history.pushState(null, '', target);
  route();
}
app.navigate = navigate;
function route() {
  const [view = 'overview', ...params] = location.hash.slice(1).split('/').map(decodeURIComponent);
  app.route = { view, params };
  render();
  $('#ed-main')?.focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
}

function renderChrome() {
  if (!app.data) return;
  const counts = new Set(app.drafts.names().map((n) => n.split(':')[1]));
  const item = (href, icon, title, current, badge = false) => `<a href="${href}" class="ed-nav-item"${current ? ' aria-current="page"' : ''}><span class="ed-nav-icon" aria-hidden="true">${icon}</span><span>${h(title)}</span>${badge ? '<span class="ed-badge" title="Unpublished draft">●</span>' : ''}</a>`;
  const { view, params } = app.route;
  $('#ed-nav').innerHTML =
    item('#overview', overviewView.icon, 'Overview', view === 'overview') +
    '<span class="ed-nav-heading">Website content</span>' +
    SECTIONS.filter((s) => app.perms.section(s.id)).map((s) => item(`#section/${s.id}`, s.icon, s.title, view === 'section' && params[0] === s.id, counts.has(s.id))).join('') +
    '<span class="ed-nav-heading">Manage</span>' +
    views.slice(1).filter((v) => !v.allowed || v.allowed(app.perms)).map((v) => item(`#${v.id}`, v.icon, v.title, view === v.id)).join('');
  const current = view === 'section' ? sectionById[params[0]]?.title : views.find((v) => v.id === view)?.title;
  $('#ed-view-title').textContent = current || 'Overview';
  const drafts = app.drafts.names().length;
  $('#ed-drafts-pill').hidden = !drafts;
  $('#ed-drafts-pill').innerHTML = `<span class="ed-dot" aria-hidden="true"></span>${drafts} unpublished draft${drafts === 1 ? '' : 's'}`;
  $('#ed-publish-all').hidden = !drafts;
  $('#ed-publish-all').textContent = drafts > 1 ? `Publish all (${drafts})` : 'Publish';
  $('#ed-user').innerHTML = `<strong>${h(app.user.displayName || app.user.email)}</strong><span>${h(app.user.email)}</span><span class="ed-role">${h(roleInfo[app.role].label)}</span>`;
}

function render() {
  if (!app.data) return;
  renderChrome();
  const main = document.createElement('div');
  main.className = 'ed-view';
  main.id = 'ed-view';
  $('#ed-view').replaceWith(main);
  app.form = null;
  const { view, params } = app.route;
  if (view === 'section') return sectionView.render(main, params);
  const v = views.find((x) => x.id === view && (!x.allowed || x.allowed(app.perms))) || overviewView;
  v.render(main, params, app);
}

function showDraftsDrawer() {
  const names = app.drafts.names();
  openDialog(
    `<h2>Unpublished drafts</h2><div class="ed-dialog-body"><p>Drafts are saved in this browser as you type. Nothing changes on the website until you publish.</p><ul class="ed-draft-list">${names
      .map((n) => {
        const id = n.split(':')[1];
        return `<li><div><strong>${h(app.sectionTitle(id))}</strong><small>Saved ${h(when(new Date(app.drafts.get(n).savedAt)))}</small></div><div class="ed-actions"><button type="button" class="ed-btn ed-btn-quiet" data-open="${h(id)}">Open</button><button type="button" class="ed-btn ed-btn-quiet" data-discard="${h(id)}">Discard</button><button type="button" class="ed-btn ed-btn-primary" data-publish="${h(id)}">Publish</button></div></li>`;
      })
      .join('')}</ul></div><div class="ed-actions"><button type="button" class="ed-btn ed-btn-quiet" data-close>Close</button><button type="button" class="ed-btn" data-preview-all>Preview website</button>${names.length > 1 ? '<button type="button" class="ed-btn ed-btn-primary" data-publish-all>Publish all</button>' : ''}</div>`,
    (dialog, close) =>
      dialog.addEventListener('click', async (e) => {
        const t = e.target.closest('button');
        if (!t) return;
        if (t.dataset.open) { close(); navigate('section', [t.dataset.open]); }
        else if (t.dataset.discard) { close(); await app.discard(t.dataset.discard); }
        else if (t.dataset.publish) { close(); await busy(null, '', () => app.publish(t.dataset.publish)); }
        else if ('publishAll' in t.dataset) { close(); await busy(null, '', () => app.publishAll()); }
        else if ('previewAll' in t.dataset) app.preview('index.html');
      }),
  );
}

// ------------------------------------------------------------------ sign-in

function showSignedOut(message = '') {
  $('#ed-signin').hidden = false;
  $('#ed-shell').hidden = true;
  $('#ed-signin-status').innerHTML = message;
  $('#ed-sign-in').hidden = false;
  $('#ed-signin-out').hidden = true;
}

async function activate(user) {
  app.user = user;
  $('#ed-signin-status').textContent = 'Checking your access…';
  app.role = await app.cloud.role(user);
  app.perms = permissions(app.role);
  if (!app.role) {
    $('#ed-signin-status').innerHTML = `Signed in as <strong>${h(user.email)}</strong>, but this account has no dashboard access. Ask the lab super-admin to add it.`;
    $('#ed-sign-in').hidden = true;
    $('#ed-signin-out').hidden = false;
    return;
  }
  app.drafts = createDrafts(user.uid, () => renderChrome());
  $('#ed-signin-status').textContent = 'Loading website content…';
  try {
    app.data = await app.cloud.load();
  } catch (error) {
    if (error?.code !== 'permission-denied' && error?.code !== 'failed-precondition') throw error;
    $('#ed-signin-status').innerHTML = `Signed in as <strong>${h(user.email)}</strong>. The lab database is not set up yet: create the Firestore database and deploy <code>firestore.rules</code> (see DASHBOARD.md), then reload this page.`;
    $('#ed-sign-in').hidden = true;
    $('#ed-signin-out').hidden = false;
    return;
  }
  $('#ed-signin').hidden = true;
  $('#ed-shell').hidden = false;
  route();
  if (!app.drafts.storageWorks) toast('This browser is not keeping drafts between visits (private window?). Publish before closing the tab.', { type: 'info' });
}

async function signOut() {
  if (app.drafts?.names().length && !(await confirmDialog({ title: 'Sign out?', body: '<p>Your unpublished drafts stay saved in this browser for your next visit.</p>', confirm: 'Sign out' }))) return;
  await app.cloud.signOut();
  app.data = null;
  showSignedOut('You are signed out.');
}

/** Firebase settings: Hosting serves them at /__/firebase/init.json; data/firebase-config.json is the fallback. */
async function loadConfig() {
  let emulator = '';
  try { emulator = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? localStorage.getItem('afmn-emulator') || '' : ''; } catch { /* ignore */ }
  if (emulator) {
    const [firestore, projectId] = emulator.split('|');
    return { firebase: { apiKey: 'demo-key', authDomain: `${projectId}.firebaseapp.com`, projectId }, emulators: { firestore, auth: firestore.replace(/:\d+$/, ':9099') } };
  }
  for (const url of ['/__/firebase/init.json', 'data/firebase-config.json']) {
    try {
      const r = await fetch(url, { cache: 'no-cache' });
      if (!r.ok) continue;
      const config = await r.json();
      if (config.apiKey) return { firebase: config };
    } catch { /* try the next one */ }
  }
  throw Error('The Firebase web app settings were not found. Register a web app in the Firebase console (Project settings → Your apps), then reload. See DASHBOARD.md.');
}

async function start() {
  try {
    app.config = await loadConfig();
    app.cloud = connect(app.config);
    if (app.cloud.testSignIn) app.testSignIn = async (email) => activate(await app.cloud.testSignIn(email));
    const user = await app.cloud.currentUser();
    if (user) await activate(user);
    else showSignedOut();
  } catch (error) {
    showSignedOut(h(errorMessage(error)));
  }
}

$('#ed-sign-in').addEventListener('click', (e) => busy(e.currentTarget, 'Opening Google sign-in…', async () => activate(await app.cloud.signIn())));
$('#ed-sign-out').addEventListener('click', signOut);
$('#ed-signin-out').addEventListener('click', signOut);
$('#ed-drafts-pill').addEventListener('click', showDraftsDrawer);
$('#ed-publish-all').addEventListener('click', (e) => busy(e.currentTarget, 'Publishing…', () => app.publishAll()));
$('#ed-nav-toggle').addEventListener('click', () => {
  const open = $('#ed-shell').classList.toggle('ed-nav-open');
  $('#ed-nav-toggle').setAttribute('aria-expanded', String(open));
});
$('#ed-nav').addEventListener('click', (e) => {
  if (e.target.closest('a')) {
    $('#ed-shell').classList.remove('ed-nav-open');
    $('#ed-nav-toggle').setAttribute('aria-expanded', 'false');
  }
});
window.addEventListener('hashchange', route);
const top = $('#ed-top');
window.addEventListener('scroll', () => (top.hidden = window.scrollY < 600), { passive: true });
top.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

start();
