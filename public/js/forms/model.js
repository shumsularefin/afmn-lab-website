// In-house website forms (recruitment applications, registrations, feedback), adapted from the
// ACS GSTU form system. Shared by the Lab Dashboard (building forms, reading responses) and the
// public form page (form.html).
//
// A form document (forms/{id}):
//   { id, title, description, status: draft|open|closed, closesAt: Timestamp|null, fields: [...], confirmation,
//     createdBy, revision, updatedAt, updatedBy, auditId }
// A field: { id, type, label, help, required, options: [string], other }
// A response (forms/{id}/responses/r_<24 hex>): { answers: { fieldId: string | string[] }, submittedAt }

export const formPath = (id) => `form/${encodeURIComponent(id)}`;
export const formLink = (id) => `${location.origin}/${formPath(id)}`;

export const fieldTypes = {
  short: 'Short answer',
  paragraph: 'Paragraph',
  email: 'Email',
  phone: 'Phone number',
  url: 'Web link (CV, portfolio, Google Drive…)',
  number: 'Number',
  date: 'Date',
  choice: 'Multiple choice (one answer)',
  checkboxes: 'Checkboxes (several answers)',
  dropdown: 'Dropdown',
  section: 'Section heading (no answer)',
};
export const choiceTypes = ['choice', 'checkboxes', 'dropdown'];
export const LIMITS = { short: 300, paragraph: 4000, fields: 60, options: 60 };

let counter = 0;
export function newFieldId() {
  counter = (counter + 1) % 1000;
  return 'q' + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 5) + counter.toString(36);
}
const q = (id, type, label, extra = {}) => ({ id, type, label, help: '', required: true, options: '', other: false, ...extra });

/** Starting points for new forms. Every question can be changed. */
export const templates = {
  application: () => ({
    title: 'Application to join the AFMN Lab',
    description:
      'Thank you for your interest in the Advanced Functional Materials and Nanotechnology Laboratory. Please fill in this form; we will contact shortlisted applicants by email.',
    confirmation: 'Thank you! Your application has been received. We will contact you by email if you are shortlisted.',
    fields: [
      q('name', 'short', 'Full name'),
      q('email', 'email', 'Email address'),
      q('phone', 'phone', 'Phone number'),
      q('position', 'dropdown', 'Position you are applying for', { options: 'B.Sc. thesis\nM.Sc. thesis\nPhD\nResearch Assistant\nInternship\nOther' }),
      q('institution', 'short', 'University and department'),
      q('student_id', 'short', 'Student ID (if you are a student)', { required: false }),
      q('degree', 'short', 'Current degree and year, for example B.Sc. 4th year'),
      q('cgpa', 'short', 'CGPA so far', { required: false }),
      q('interest', 'checkboxes', 'Research areas you are interested in', {
        options: 'UV and blue-light shielding films\nBiodegradable packaging and biomaterials\nLuminescence sensing\nMicrofluidic chemiluminescence\nWater treatment',
        other: true,
      }),
      q('skills', 'paragraph', 'Laboratory or computational skills', { required: false }),
      q('statement', 'paragraph', 'Why do you want to join the lab, and what would you like to work on?'),
      q('cv', 'url', 'Link to your CV (Google Drive or similar, shared so anyone with the link can view)', {
        help: 'Upload your CV to Google Drive, choose Share → Anyone with the link, and paste the link here.',
      }),
      q('start', 'date', 'When could you start?', { required: false }),
    ],
  }),
  registration: () => ({
    title: 'Registration',
    description: 'Register for the event.',
    confirmation: 'Thank you! You are registered.',
    fields: [q('name', 'short', 'Full name'), q('email', 'email', 'Email address'), q('phone', 'phone', 'Phone number', { required: false }), q('institution', 'short', 'Institution')],
  }),
  blank: () => ({ title: 'Untitled form', description: '', confirmation: 'Thank you! Your response has been recorded.', fields: [q('name', 'short', 'Full name')] }),
};

export function newForm(kind = 'application') {
  return { id: '', status: 'draft', closesOn: '', ...(templates[kind] || templates.blank)() };
}

// ------------------------------------------------------------------ dates (Bangladesh time, UTC+06:00)

/** A form stays open through the whole closing day, Bangladesh time. */
export const closesAtFromDay = (day) => (day ? new Date(`${day}T23:59:59+06:00`) : null);
export const dayFromClosesAt = (date) => (date ? new Date(new Date(date).getTime() + 6 * 3600 * 1000).toISOString().slice(0, 10) : '');
const dayFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', day: 'numeric', month: 'long', year: 'numeric' });
export const dayLabel = (date) => (date ? dayFormat.format(new Date(date)) : '');

/** 'draft' | 'open' | 'ended' | 'closed' */
export function formState(form, now = new Date()) {
  if (form.status === 'draft') return 'draft';
  if (form.status === 'closed') return 'closed';
  if (form.closesAt && now >= new Date(form.closesAt)) return 'ended';
  return 'open';
}
export const stateLabels = { draft: 'Hidden (draft)', open: 'Accepting responses', ended: 'Deadline passed', closed: 'Closed' };

// ------------------------------------------------------------------ validation for editors

const text = (v, max) => String(v ?? '').trim().slice(0, max);
const optionList = (v) => [...new Set((Array.isArray(v) ? v : String(v ?? '').split('\n')).map((s) => text(s, 200)).filter(Boolean))];

function normalizeField(raw, index) {
  const type = raw.type in fieldTypes ? raw.type : 'short';
  const label = text(raw.label, 300);
  if (!label) throw Error(`Question ${index + 1} needs a title.`);
  const f = {
    id: /^[a-z][a-z0-9_]{0,39}$/.test(raw.id || '') ? raw.id : newFieldId(),
    type,
    label,
    help: text(raw.help, 500),
    required: type === 'section' ? false : !!raw.required,
    options: [],
    other: false,
  };
  if (choiceTypes.includes(type)) {
    f.options = optionList(raw.options).slice(0, LIMITS.options);
    if (!f.options.length) throw Error(`Question ${index + 1} (“${label}”) needs at least one option, one per line.`);
    f.other = type !== 'dropdown' && !!raw.other;
  }
  return f;
}

/** Validates a form for publishing and returns what is stored. Throws a readable message. */
export function normalizeForm(raw) {
  const id = String(raw.id || '').trim();
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id) || id.length > 80) throw Error('The web address may use lowercase letters, numbers and hyphens.');
  const title = text(raw.title, 200);
  if (!title) throw Error('Give the form a title.');
  const fields = (raw.fields || []).map(normalizeField);
  if (!fields.some((f) => f.type !== 'section')) throw Error('Add at least one question.');
  if (fields.length > LIMITS.fields) throw Error(`A form can have up to ${LIMITS.fields} questions.`);
  const ids = new Set();
  for (const f of fields) {
    if (ids.has(f.id)) f.id = newFieldId();
    ids.add(f.id);
  }
  if (raw.closesOn && !/^\d{4}-\d{2}-\d{2}$/.test(raw.closesOn)) throw Error('Check the closing date.');
  return {
    id,
    title,
    description: text(raw.description, 3000),
    status: ['draft', 'open', 'closed'].includes(raw.status) ? raw.status : 'draft',
    closesAt: closesAtFromDay(raw.closesOn),
    fields,
    confirmation: text(raw.confirmation, 1000) || 'Thank you! Your response has been recorded.',
  };
}

/** A stored form as the dashboard edits it (options as lines, closing day instead of a timestamp). */
export const editable = (form) => ({
  ...form,
  closesOn: dayFromClosesAt(form.closesAt),
  fields: (form.fields || []).map((f) => ({ ...f, options: (f.options || []).join('\n') })),
});

// ------------------------------------------------------------------ answering

export function responseId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return 'r_' + [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Checks answers against the form. Returns { answers, errors } (errors maps field IDs to messages). */
export function checkAnswers(form, raw) {
  const answers = {};
  const errors = {};
  for (const f of form.fields) {
    if (f.type === 'section') continue;
    let v = raw[f.id];
    if (f.type === 'checkboxes') {
      v = (Array.isArray(v) ? v : v ? [v] : []).map((x) => text(x, 300)).filter(Boolean);
      if (!f.other) v = v.filter((x) => f.options.includes(x));
      if (f.required && !v.length) errors[f.id] = 'Choose at least one option.';
      if (v.length) answers[f.id] = [...new Set(v)].slice(0, LIMITS.options + 1);
      continue;
    }
    v = text(v, f.type === 'paragraph' ? LIMITS.paragraph : LIMITS.short);
    if (!v) {
      if (f.required) errors[f.id] = 'This question is required.';
      continue;
    }
    if (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) errors[f.id] = 'Enter a valid email address.';
    if (f.type === 'phone' && !/^\+?[0-9][0-9\s-]{6,18}$/.test(v)) errors[f.id] = 'Enter a valid phone number, for example 01XXXXXXXXX.';
    if (f.type === 'url' && !/^https?:\/\/\S+\.\S+/.test(v)) errors[f.id] = 'Enter a full link starting with https://';
    if (f.type === 'number' && !/^-?\d+(\.\d+)?$/.test(v)) errors[f.id] = 'Enter a number.';
    if (f.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) errors[f.id] = 'Enter a date.';
    if ((f.type === 'choice' || f.type === 'dropdown') && !f.options.includes(v) && !f.other) errors[f.id] = 'Choose one of the options.';
    answers[f.id] = v;
  }
  return { answers, errors };
}

// ------------------------------------------------------------------ results

export const answerText = (v) => (Array.isArray(v) ? v.join(', ') : (v ?? ''));

/** Columns: current questions, then answers to questions that were removed later. */
export function responseColumns(form, responses = []) {
  const cols = form.fields.filter((f) => f.type !== 'section').map((f) => [f.id, f.label]);
  const known = new Set(cols.map(([id]) => id));
  for (const r of responses) for (const id of Object.keys(r.answers || {})) if (!known.has(id)) { known.add(id); cols.push([id, `${id} (removed question)`]); }
  return cols;
}

/** CSV (opens in Excel and Google Sheets): one row per response, oldest first. */
export function responsesCSV(form, responses) {
  const cols = responseColumns(form, responses);
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Submitted', ...cols.map(([, label]) => label)]];
  for (const r of [...responses].sort((a, b) => (a.submittedAt?.getTime?.() || 0) - (b.submittedAt?.getTime?.() || 0)))
    rows.push([r.submittedAt ? r.submittedAt.toISOString() : '', ...cols.map(([id]) => answerText(r.answers?.[id]))]);
  return '﻿' + rows.map((row) => row.map(cell).join(',')).join('\r\n');
}
