// Forms: build in-house forms (recruitment applications, registrations…), share their link, and read
// or download the responses. Adapted from the ACS GSTU Chapter Editor's form system.
import { h, $, $$, toast, confirmDialog, busy, when, download, slug } from './ui.js';
import { createForm, validate } from './form.js';
import { ConflictError } from './cloud.js';
import { fieldTypes, templates, newForm, normalizeForm, editable, formState, stateLabels, formLink, formPath, dayLabel, responseColumns, responsesCSV, answerText } from '../forms/model.js';

const QUESTION_HINT = 'For multiple choice, checkboxes and dropdowns: one option per line.';
const formSchema = (isNew) => [
  { key: 'title', label: 'Title', type: 'text', required: true, max: 200 },
  ...(isNew ? [{ key: 'id', label: 'Web address', type: 'slug', from: 'title', required: true, max: 60, hint: 'The form opens at afmn-lab.web.app/form/<this>. Filled in from the title; it cannot change after the first save.' }] : []),
  { key: 'status', label: 'Status', type: 'select', half: true, options: [['draft', 'Hidden (draft)'], ['open', 'Open: accepting responses'], ['closed', 'Closed']] },
  { key: 'closesOn', label: 'Accept responses until (inclusive)', type: 'date', half: true, hint: 'Optional. Bangladesh time; the form closes by itself after this day.' },
  { key: 'description', label: 'Description', type: 'textarea', rows: 4, max: 3000 },
  {
    key: 'fields',
    label: 'Questions',
    type: 'list',
    addLabel: 'Add question',
    search: true,
    itemLabel: (f) => f.label || 'New question',
    itemTag: (f) => [fieldTypes[f.type]?.split(' (')[0], f.required ? 'Required' : ''].filter(Boolean).join(' · '),
    fields: [
      { key: 'label', label: 'Question', type: 'text', required: true, max: 300 },
      { key: 'type', label: 'Answer type', type: 'select', half: true, options: Object.entries(fieldTypes) },
      { key: 'required', label: 'Required', type: 'checkbox', half: true, default: true },
      { key: 'help', label: 'Help text (optional)', type: 'text', max: 500 },
      { key: 'options', label: 'Options', type: 'lines', rows: 4, hint: QUESTION_HINT },
      { key: 'other', label: 'Allow an “Other” answer (multiple choice and checkboxes)', type: 'checkbox' },
    ],
  },
  { key: 'confirmation', label: 'Message after submitting', type: 'textarea', rows: 2, max: 1000 },
];

const stateTag = (form) => {
  const s = formState(form);
  return `<span class="ed-tag ${s === 'open' ? 'ed-tag-open' : ''}">${h(stateLabels[s])}</span>`;
};

export const formsView = {
  id: 'forms',
  title: 'Forms',
  icon: '📝',
  allowed: (p) => p.forms,
  render(root, [id], app) {
    if (id) return editor(root, id, app);
    const forms = [...app.data.forms].sort((a, b) => (b.updatedAt?.getTime() || 0) - (a.updatedAt?.getTime() || 0));
    root.innerHTML = `
      <section class="ed-card"><div class="ed-card-head"><h3>In-house forms</h3></div>
        <p>Build application and registration forms on the lab’s own website, like Google Forms. Answers are stored privately: only lab editors and super-admins can read them here, and download them for Excel. Choose a form under <a href="#section/openings">Openings &amp; recruiting</a> to put an Apply button on a position.</p>
        <div class="ed-actions"><button type="button" class="ed-btn ed-btn-primary" data-new="application">+ Recruitment application</button><button type="button" class="ed-btn" data-new="registration">+ Event registration</button><button type="button" class="ed-btn ed-btn-quiet" data-new="blank">+ Blank form</button></div></section>
      <section class="ed-card">${forms.length
        ? `<div class="ed-table-wrap"><table class="ed-table"><thead><tr><th>Form</th><th>Status</th><th>Closes</th><th>Updated</th><th><span class="ed-sr">Actions</span></th></tr></thead><tbody>${forms
            .map((f) => `<tr><td><a href="#forms/${h(f.value.id)}"><strong>${h(f.value.title)}</strong></a><br><small class="ed-mono">/${h(formPath(f.value.id))}</small></td><td>${stateTag(f.value)}</td><td>${h(dayLabel(f.value.closesAt) || '—')}</td><td>${h(when(f.updatedAt))}</td><td><div class="ed-actions"><a class="ed-btn ed-btn-small" href="#forms/${h(f.value.id)}">Edit &amp; responses</a><button type="button" class="ed-btn ed-btn-small ed-btn-quiet" data-copy="${h(formLink(f.value.id))}">Copy link</button></div></td></tr>`)
            .join('')}</tbody></table></div>`
        : '<p class="ed-muted">No forms yet. Start with a recruitment application above.</p>'}</section>`;
    root.addEventListener('click', async (e) => {
      const n = e.target.closest('[data-new]');
      if (n) {
        app.newFormDraft = newForm(n.dataset.new);
        app.navigate('forms', ['new']);
      }
      const c = e.target.closest('[data-copy]');
      if (c) {
        await navigator.clipboard.writeText(c.dataset.copy).catch(() => {});
        toast('Link copied. Share it on WhatsApp, Facebook or email.');
      }
    });
  },
};

function editor(root, id, app) {
  const isNew = id === 'new';
  const entry = isNew ? null : app.data.forms.find((f) => f.value.id === id);
  if (!isNew && !entry) return app.navigate('forms');
  const start = isNew ? app.newFormDraft || newForm('application') : editable(entry.value);
  let revision = entry?.revision || 0;
  root.innerHTML = `
    <p class="ed-intro"><a href="#forms">← All forms</a></p>
    ${isNew ? '' : `<section class="ed-card ed-card-attention"><div class="ed-card-head"><h3>Share this form</h3>${stateTag(entry.value)}</div>
      <p class="ed-mono">${h(formLink(id))}</p>
      <div class="ed-actions"><button type="button" class="ed-btn ed-btn-small" data-copy>Copy link</button><a class="ed-btn ed-btn-small ed-btn-quiet" href="${h(formPath(id))}" target="_blank" rel="noopener">Open the form ↗</a></div>
      ${formState(entry.value) === 'draft' ? '<p class="ed-muted">The form is hidden until you set its status to Open and save.</p>' : ''}</section>`}
    <form class="ed-card ed-form" novalidate data-form></form>
    <div class="ed-status"><span class="ed-chip" data-dirty>${isNew ? 'New form · not saved yet' : 'Saved'}</span><div class="ed-actions">${!isNew && app.perms.deleteForms ? '<button type="button" class="ed-btn ed-btn-small ed-btn-danger-quiet" data-delete>Delete form</button>' : ''}<button type="button" class="ed-btn ed-btn-primary" data-save>${isNew ? 'Create form' : 'Save changes'}</button></div></div>
    ${isNew ? '' : `<section class="ed-card"><div class="ed-card-head"><h3>Responses</h3><div class="ed-actions"><button type="button" class="ed-btn ed-btn-small" data-load>Show responses</button></div></div><div data-responses><p class="ed-muted">Responses are private. Press “Show responses” to read them.</p></div></section>`}`;
  const fields = formSchema(isNew);
  const form = createForm($('[data-form]', root), fields, start, { app, onChange: () => ($('[data-dirty]', root).textContent = 'Unsaved changes', $('[data-dirty]', root).className = 'ed-chip ed-chip-draft') });
  app.form = form;
  app.dirtyForm = () => $('[data-dirty]', root)?.textContent === 'Unsaved changes';

  root.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if ('copy' in t.dataset && !t.dataset.copy) {
      await navigator.clipboard.writeText(formLink(id)).catch(() => {});
      toast('Link copied.');
    } else if ('save' in t.dataset) {
      await busy(t, 'Saving…', async () => {
        const value = form.value();
        const problem = validate(fields, value);
        if (problem) return form.focusProblem(problem);
        let normalized;
        try {
          normalized = normalizeForm({ ...value, id: isNew ? slug(value.id) : id });
        } catch (error) {
          return toast(error.message, { type: 'error' });
        }
        if (isNew && app.data.forms.some((f) => f.value.id === normalized.id)) return toast('A form with this web address already exists. Change the web address.', { type: 'error' });
        try {
          revision = await app.cloud.saveForm(normalized, revision);
        } catch (error) {
          if (!(error instanceof ConflictError)) throw error;
          if (!(await confirmDialog({ title: 'Someone else changed this form', body: '<p>Another editor saved this form after you opened it. Save yours over theirs?</p>', confirm: 'Save mine' }))) return;
          revision = await app.cloud.saveForm(normalized, error.revision);
        }
        app.newFormDraft = null;
        app.data = await app.cloud.load();
        toast(isNew ? 'Form created. Set it to Open when you are ready, and share its link.' : 'Form saved.');
        if (isNew) app.navigate('forms', [normalized.id]);
        else app.render();
      });
    } else if ('delete' in t.dataset) {
      if (!(await confirmDialog({ title: `Delete “${entry.value.title}”?`, body: '<p>The form stops working at once. Its responses stay in the database until you delete them; download them first.</p>', confirm: 'Delete form', danger: true }))) return;
      await busy(t, 'Deleting…', async () => {
        await app.cloud.deleteForm(id);
        app.data = await app.cloud.load();
        toast('Form deleted.');
        app.navigate('forms');
      });
    } else if ('load' in t.dataset) {
      await busy(t, 'Loading…', () => showResponses(root, entry.value, app));
    }
  });
}

async function showResponses(root, form, app) {
  const list = (await app.cloud.responses(form.id)).sort((a, b) => (b.submittedAt?.getTime() || 0) - (a.submittedAt?.getTime() || 0));
  const cols = responseColumns(form, list);
  const box = $('[data-responses]', root);
  box.innerHTML = list.length
    ? `<p><strong>${list.length}</strong> response${list.length === 1 ? '' : 's'}.</p>
      <div class="ed-actions"><button type="button" class="ed-btn ed-btn-small ed-btn-primary" data-csv>Download for Excel (CSV)</button>${app.perms.deleteForms ? '<button type="button" class="ed-btn ed-btn-small ed-btn-danger-quiet" data-clear>Delete all responses</button>' : ''}</div>
      <div class="ed-table-wrap"><table class="ed-table"><thead><tr><th>Submitted</th>${cols.map(([, label]) => `<th>${h(label)}</th>`).join('')}</tr></thead><tbody>${list
        .map((r) => `<tr><td>${h(when(r.submittedAt))}</td>${cols.map(([cid]) => `<td>${linkify(answerText(r.answers[cid]))}</td>`).join('')}</tr>`)
        .join('')}</tbody></table></div>`
    : '<p class="ed-muted">No responses yet.</p>';
  $('[data-csv]', box)?.addEventListener('click', () => download(`${form.id}-responses-${new Date().toISOString().slice(0, 10)}.csv`, responsesCSV(form, list), 'text/csv;charset=utf-8'));
  $('[data-clear]', box)?.addEventListener('click', async (e) => {
    if (!(await confirmDialog({ title: `Delete all ${list.length} responses?`, body: '<p>This cannot be undone. Download them first if you need them.</p>', confirm: 'Delete responses', danger: true }))) return;
    await busy(e.currentTarget, 'Deleting…', async () => {
      await app.cloud.deleteResponses(form.id, list.map((r) => r.id));
      toast('Responses deleted.');
      await showResponses(root, form, app);
    });
  });
}
const linkify = (text) => (/^https?:\/\/\S+$/.test(text) ? `<a href="${h(text)}" target="_blank" rel="noopener">${h(text)}</a>` : h(text));
