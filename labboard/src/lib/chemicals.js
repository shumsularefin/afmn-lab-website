// Chemical inventory: stock levels, usage log, reorder requests.
// Every change to a quantity writes a log entry in the same transaction; the security rules
// check that the two match, so the stock level always has a paper trail.
import { collection, deleteDoc, doc, runTransaction, serverTimestamp, Timestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { toDate } from './time';

// ── Units ────────────────────────────────────────────────────────────────────

export const UNITS = [
  { value: 'g', family: 'mass', factor: 1 },
  { value: 'mg', family: 'mass', factor: 1e-3 },
  { value: 'kg', family: 'mass', factor: 1e3 },
  { value: 'mL', family: 'volume', factor: 1 },
  { value: 'µL', family: 'volume', factor: 1e-3 },
  { value: 'L', family: 'volume', factor: 1e3 },
  { value: 'units', family: 'count', factor: 1 },
  { value: 'bottles', family: 'bottles', factor: 1 },
  { value: 'packs', family: 'packs', factor: 1 },
];
const UNIT = Object.fromEntries(UNITS.map((u) => [u.value, u]));
export const unitsLike = (unit) => UNITS.filter((u) => u.family === (UNIT[unit]?.family || unit));

/** Rounds away floating-point noise (0.1 + 0.2) without losing real precision. */
export const round = (n) => Math.round(n * 1e6) / 1e6;

/** Converts `amount` from one unit to another of the same kind (mL → L, mg → g). */
export function convert(amount, from, to) {
  if (from === to) return amount;
  const a = UNIT[from];
  const b = UNIT[to];
  if (!a || !b || a.family !== b.family) throw new Error(`Can't convert ${from} to ${to}.`);
  return round((amount * a.factor) / b.factor);
}

/** "2.5 L", "750 mL", "12 units" — keeps the chemical's own unit, trims trailing zeros. */
export function fmtQty(n, unit) {
  if (n == null || Number.isNaN(n)) return '—';
  const v = Math.abs(n) >= 100 ? Math.round(n * 10) / 10 : Math.round(n * 1000) / 1000;
  return `${v.toLocaleString(undefined, { maximumFractionDigits: 3 })} ${unit || ''}`.trim();
}

// ── Reference lists ──────────────────────────────────────────────────────────

export const CATEGORIES = [
  'Acids', 'Bases', 'Solvents', 'Salts', 'Buffers', 'Reagents', 'Biochemicals & enzymes', 'Kits',
  'Media & supplements', 'Standards', 'Dyes & indicators', 'Gases', 'Consumables', 'Other',
];

export const STORAGE = [
  'Room temperature', 'Fridge 2–8 °C', 'Freezer −20 °C', 'Freezer −80 °C', 'Flammables cabinet',
  'Acid cabinet', 'Base cabinet', 'Toxics cabinet (locked)', 'Desiccator', 'Dark / light-sensitive', 'Gas cylinder rack',
];

// GHS hazard classes (with the pictogram code) — shown as red-diamond chips.
export const HAZARDS = [
  { value: 'flammable', label: 'Flammable', code: 'GHS02', symbol: '🔥' },
  { value: 'oxidizer', label: 'Oxidizer', code: 'GHS03', symbol: '⭘' },
  { value: 'explosive', label: 'Explosive', code: 'GHS01', symbol: '✸' },
  { value: 'gas', label: 'Gas under pressure', code: 'GHS04', symbol: '⬭' },
  { value: 'corrosive', label: 'Corrosive', code: 'GHS05', symbol: '⚗' },
  { value: 'toxic', label: 'Acute toxic', code: 'GHS06', symbol: '☠' },
  { value: 'irritant', label: 'Irritant / harmful', code: 'GHS07', symbol: '!' },
  { value: 'health', label: 'Serious health hazard', code: 'GHS08', symbol: '✚' },
  { value: 'environment', label: 'Environmental hazard', code: 'GHS09', symbol: '🐟' },
];
export const HAZARD = Object.fromEntries(HAZARDS.map((h) => [h.value, h]));

export const CAS_RE = /^\d{2,7}-\d{2}-\d$/;

/** Validates the CAS check digit (e.g. 7732-18-5 for water). */
export function casValid(cas) {
  if (!CAS_RE.test(cas)) return false;
  const digits = cas.replace(/-/g, '');
  const check = Number(digits.at(-1));
  const sum = digits
    .slice(0, -1)
    .split('')
    .reverse()
    .reduce((s, d, i) => s + Number(d) * (i + 1), 0);
  return sum % 10 === check;
}

// ── Status ───────────────────────────────────────────────────────────────────

export const EXPIRY_WARN_DAYS = 30;

/**
 * Where a chemical stands right now. `kind` is the single most important state (used for colours and
 * filters); `flags` lists everything that applies (e.g. low AND expiring).
 */
export function chemStatus(c, now = new Date()) {
  const q = Number(c.quantity) || 0;
  const exp = toDate(c.expiry);
  const days = exp ? (exp - now) / 864e5 : null;
  const flags = [];
  if (q <= 0) flags.push('out');
  else if (c.minQuantity > 0 && q <= c.minQuantity) flags.push('low');
  if (days != null && days < 0) flags.push('expired');
  else if (days != null && days <= EXPIRY_WARN_DAYS) flags.push('expiring');
  if (c.reorder) flags.push('requested');
  const kind = ['out', 'expired', 'low', 'expiring'].find((f) => flags.includes(f)) || 'ok';
  return { kind, flags, days };
}

export const CHEM_STATUS = {
  ok: { label: 'In stock', chip: 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300', bar: 'bg-emerald-500', dot: 'bg-emerald-500' },
  low: { label: 'Low stock', chip: 'bg-orange-500/15 text-orange-800 dark:bg-orange-500/20 dark:text-orange-300', bar: 'bg-orange-500', dot: 'bg-orange-500' },
  out: { label: 'Out of stock', chip: 'bg-rose-500/10 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300', bar: 'bg-rose-500', dot: 'bg-rose-500' },
  expiring: { label: 'Expiring soon', chip: 'bg-amber-500/15 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200', bar: 'bg-emerald-500', dot: 'bg-amber-500' },
  expired: { label: 'Expired', chip: 'bg-rose-500/10 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300', bar: 'bg-slate-400', dot: 'bg-rose-500' },
  requested: { label: 'Reorder requested', chip: 'bg-violet-500/10 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300' },
};

/** 0–1 fill level for the stock bar: against the full container size, else twice the reorder level. */
export function fillLevel(c) {
  const q = Math.max(0, Number(c.quantity) || 0);
  const full = c.containerSize > 0 ? c.containerSize : c.minQuantity > 0 ? c.minQuantity * 4 : q || 1;
  return Math.min(1, q / full);
}

/** Text search over everything a person might type. */
export function chemMatches(c, q) {
  if (!q) return true;
  const hay = [c.name, c.formula, c.cas, c.category, c.location, c.storage, c.supplier, c.catalogNo, c.lotNo, c.grade, c.notes]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

// ── Writes ───────────────────────────────────────────────────────────────────

const STR = { name: 200, formula: 100, cas: 20, category: 60, grade: 100, location: 120, storage: 80, supplier: 120, catalogNo: 60, lotNo: 60, sdsURL: 500, photo: 600, notes: 2000 };

/** Normalises a form into the stored shape (the rules check the same limits). */
export function cleanChemical(d) {
  const out = {};
  for (const [k, max] of Object.entries(STR)) out[k] = String(d[k] ?? '').trim().slice(0, max);
  const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? 0 : Math.max(0, round(Number(v))));
  out.quantity = num(d.quantity);
  out.minQuantity = num(d.minQuantity);
  out.containerSize = num(d.containerSize);
  out.unit = UNIT[d.unit] ? d.unit : 'g';
  out.hazards = [...new Set((d.hazards || []).filter((h) => HAZARD[h]))];
  const exp = d.expiry ? toDate(d.expiry instanceof Date || d.expiry?.toDate ? d.expiry : new Date(d.expiry + 'T12:00')) : null;
  out.expiry = exp && !Number.isNaN(exp.getTime()) ? Timestamp.fromDate(exp) : null;
  return out;
}

const chemRef = (id) => doc(db, 'chemicals', id);
const newLogRef = () => doc(collection(db, 'chemicalLogs'));

function logEntry(type, c, profile, { amount, before, after, note = '', lotNo = '' }) {
  return {
    type,
    chemicalId: c.id,
    chemicalName: c.name,
    unit: c.unit,
    amount: round(amount),
    before: round(before),
    after: round(after),
    note: String(note || '').trim().slice(0, 500),
    lotNo: String(lotNo || '').trim().slice(0, 60),
    userId: profile.uid,
    userName: profile.name || profile.email || '',
    createdAt: serverTimestamp(),
  };
}

/** Admin: add a chemical; the starting stock is logged as a restock. */
export async function createChemical(data, profile) {
  const ref = doc(collection(db, 'chemicals'));
  const c = { id: ref.id, ...cleanChemical(data) };
  const log = newLogRef();
  const batch = writeBatch(db);
  batch.set(ref, {
    ...cleanChemical(data),
    reorder: null,
    lastLogId: log.id,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: profile.uid,
  });
  batch.set(log, logEntry('create', c, profile, { amount: c.quantity, before: 0, after: c.quantity, note: 'Added to inventory', lotNo: c.lotNo }));
  await batch.commit();
  return ref.id;
}

/** Admin: edit details. A quantity change made here is logged as a stocktake correction. */
export async function updateChemical(current, data, profile) {
  const next = cleanChemical(data);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(chemRef(current.id));
    if (!snap.exists()) throw new Error('This chemical was deleted.');
    const before = snap.data().quantity || 0;
    const patch = { ...next, updatedAt: serverTimestamp(), updatedBy: profile.uid };
    if (round(before) !== next.quantity) {
      const log = newLogRef();
      tx.set(log, logEntry('adjust', { ...current, ...next }, profile, { amount: Math.abs(next.quantity - before), before, after: next.quantity, note: 'Edited in chemical details' }));
      patch.lastLogId = log.id;
    }
    tx.update(chemRef(current.id), patch);
  });
}

export function deleteChemical(id) {
  return deleteDoc(chemRef(id));
}

/**
 * Anyone with a member account: take `amount` (in `unit`) out of stock. Runs in a transaction so two
 * people using the last of a bottle at the same time can't drive the stock below zero.
 */
export async function recordUse({ chemical, amount, unit, note, profile }) {
  const amt = Number(amount);
  if (!(amt > 0)) throw new Error('Enter how much you used.');
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(chemRef(chemical.id));
    if (!snap.exists()) throw new Error('This chemical was removed from the inventory.');
    const c = { id: snap.id, ...snap.data() };
    const inUnit = convert(amt, unit || c.unit, c.unit);
    const before = round(c.quantity || 0);
    if (inUnit > before + 1e-9) throw new Error(`Only ${fmtQty(before, c.unit)} left in stock.`);
    const after = Math.max(0, round(before - inUnit));
    const log = newLogRef();
    tx.set(log, logEntry('use', c, profile, { amount: inUnit, before, after, note }));
    tx.update(chemRef(c.id), { quantity: after, lastLogId: log.id, updatedAt: serverTimestamp(), updatedBy: profile.uid });
    return { after, unit: c.unit, name: c.name };
  });
}

/** Admin: received new stock. Clears an open reorder request. */
export async function restockChemical({ chemical, amount, unit, lotNo, expiry, note, profile }) {
  const amt = Number(amount);
  if (!(amt > 0)) throw new Error('Enter the amount received.');
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(chemRef(chemical.id));
    if (!snap.exists()) throw new Error('This chemical was removed from the inventory.');
    const c = { id: snap.id, ...snap.data() };
    const inUnit = convert(amt, unit || c.unit, c.unit);
    const before = round(c.quantity || 0);
    const after = round(before + inUnit);
    const log = newLogRef();
    tx.set(log, logEntry('restock', c, profile, { amount: inUnit, before, after, note, lotNo }));
    const patch = { quantity: after, reorder: null, lastLogId: log.id, updatedAt: serverTimestamp(), updatedBy: profile.uid };
    if (lotNo) patch.lotNo = String(lotNo).trim().slice(0, 60);
    if (expiry) patch.expiry = Timestamp.fromDate(new Date(expiry + 'T12:00'));
    tx.update(chemRef(c.id), patch);
  });
}

/** Admin: stocktake — set the exact amount on the shelf (disposal, spills, counting errors). */
export async function setStock({ chemical, quantity, note, profile }) {
  const q = Number(quantity);
  if (!(q >= 0)) throw new Error('Enter the amount on the shelf.');
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(chemRef(chemical.id));
    if (!snap.exists()) throw new Error('This chemical was removed from the inventory.');
    const c = { id: snap.id, ...snap.data() };
    const before = round(c.quantity || 0);
    const after = round(q);
    const log = newLogRef();
    tx.set(log, logEntry('adjust', c, profile, { amount: Math.abs(after - before), before, after, note: note || 'Stocktake' }));
    tx.update(chemRef(c.id), { quantity: after, lastLogId: log.id, updatedAt: serverTimestamp(), updatedBy: profile.uid });
  });
}

/** Members: "we're running out" — one open request per chemical, visible to everyone. */
export function requestReorder(chemical, profile, note = '') {
  return updateDoc(chemRef(chemical.id), {
    reorder: { uid: profile.uid, name: profile.name || profile.email || '', note: String(note).trim().slice(0, 300), at: serverTimestamp() },
  });
}

export function cancelReorder(chemical) {
  return updateDoc(chemRef(chemical.id), { reorder: null });
}

// ── CSV import ───────────────────────────────────────────────────────────────

export const CSV_COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'formula', label: 'Formula' },
  { key: 'cas', label: 'CAS' },
  { key: 'category', label: 'Category' },
  { key: 'grade', label: 'Grade' },
  { key: 'quantity', label: 'Quantity' },
  { key: 'unit', label: 'Unit' },
  { key: 'minQuantity', label: 'Reorder level' },
  { key: 'containerSize', label: 'Container size' },
  { key: 'location', label: 'Location' },
  { key: 'storage', label: 'Storage' },
  { key: 'hazards', label: 'Hazards', get: (c) => (c.hazards || []).join(' ') },
  { key: 'supplier', label: 'Supplier' },
  { key: 'catalogNo', label: 'Catalog no' },
  { key: 'lotNo', label: 'Lot no' },
  { key: 'expiry', label: 'Expiry', get: (c) => (toDate(c.expiry) ? toDate(c.expiry).toISOString().slice(0, 10) : '') },
  { key: 'sdsURL', label: 'SDS link' },
  { key: 'notes', label: 'Notes' },
];

/** Minimal RFC-4180 CSV parser (quotes, commas and newlines inside quotes). */
export function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',' || ch === '\t' || ch === ';') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const norm = (h) => h.toLowerCase().replace(/[^a-z]/g, '');
const HEADER_KEYS = {
  name: 'name', chemical: 'name', chemicalname: 'name', formula: 'formula', cas: 'cas', casno: 'cas', casnumber: 'cas',
  category: 'category', type: 'category', grade: 'grade', purity: 'grade', quantity: 'quantity', qty: 'quantity', amount: 'quantity',
  unit: 'unit', units: 'unit', reorderlevel: 'minQuantity', minquantity: 'minQuantity', minimum: 'minQuantity', min: 'minQuantity',
  containersize: 'containerSize', size: 'containerSize', location: 'location', shelf: 'location', storage: 'storage',
  hazards: 'hazards', hazard: 'hazards', supplier: 'supplier', vendor: 'supplier', catalogno: 'catalogNo', catalog: 'catalogNo',
  catno: 'catalogNo', lotno: 'lotNo', lot: 'lotNo', batch: 'lotNo', expiry: 'expiry', expirydate: 'expiry', expires: 'expiry',
  sds: 'sdsURL', sdslink: 'sdsURL', msds: 'sdsURL', notes: 'notes', comments: 'notes',
};

/** Turns CSV text into chemical forms plus a list of problems, before anything is written. */
export function chemicalsFromCSV(text) {
  const [head = [], ...body] = parseCSV(text);
  const keys = head.map((h) => HEADER_KEYS[norm(h)] || null);
  if (!keys.includes('name')) return { items: [], problems: ['The first row must be a header with at least a “Name” column.'] };
  const problems = [];
  const items = body.map((r, i) => {
    const o = {};
    keys.forEach((k, j) => k && (o[k] = (r[j] ?? '').trim()));
    const unitMatch = UNITS.find((u) => u.value.toLowerCase() === (o.unit || '').toLowerCase() || (o.unit === 'ul' && u.value === 'µL'));
    o.unit = unitMatch?.value || 'g';
    o.hazards = (o.hazards || '')
      .toLowerCase()
      .split(/[\s,;/|]+/)
      .map((h) => HAZARDS.find((x) => x.value === h || x.code.toLowerCase() === h || x.label.toLowerCase().startsWith(h))?.value)
      .filter(Boolean);
    if (o.expiry && Number.isNaN(new Date(o.expiry + 'T12:00').getTime())) {
      problems.push(`Row ${i + 2}: expiry “${o.expiry}” isn't a date (use YYYY-MM-DD) — left empty.`);
      o.expiry = '';
    }
    if (!o.name) problems.push(`Row ${i + 2}: no name — skipped.`);
    return o;
  });
  return { items: items.filter((o) => o.name), problems };
}

/** Admin: write imported chemicals in batches (each with its "added" log entry). */
export async function importChemicals(items, profile) {
  for (let i = 0; i < items.length; i += 200) {
    const batch = writeBatch(db);
    for (const data of items.slice(i, i + 200)) {
      const ref = doc(collection(db, 'chemicals'));
      const log = newLogRef();
      const clean = cleanChemical(data);
      batch.set(ref, { ...clean, reorder: null, lastLogId: log.id, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: profile.uid });
      batch.set(log, logEntry('create', { id: ref.id, ...clean }, profile, { amount: clean.quantity, before: 0, after: clean.quantity, note: 'Imported from CSV', lotNo: clean.lotNo }));
    }
    await batch.commit();
  }
  return items.length;
}

