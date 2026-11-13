// Time helpers. All times are shown in the browser's local time zone.

export const MIN = 60 * 1000;
export const HOUR = 60 * MIN;

export function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v.toDate === 'function') return v.toDate();
  if (typeof v === 'number' || typeof v === 'string') return new Date(v);
  if (typeof v.seconds === 'number') return new Date(v.seconds * 1000);
  return null;
}

export function fmtTime(v) {
  const d = toDate(v);
  return d ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '–';
}

export function fmtDate(v) {
  const d = toDate(v);
  return d ? d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '–';
}

export function fmtDateTime(v) {
  const d = toDate(v);
  if (!d) return '–';
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const tomorrow = new Date(today.getTime() + 24 * HOUR).toDateString() === d.toDateString();
  if (sameDay) return `Today ${fmtTime(d)}`;
  if (tomorrow) return `Tomorrow ${fmtTime(d)}`;
  return `${d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} ${fmtTime(d)}`;
}

/** "2h 05m", "45m", "3d 4h" */
export function fmtDuration(ms) {
  if (ms == null || isNaN(ms)) return '–';
  const neg = ms < 0;
  ms = Math.abs(ms);
  const totalMin = Math.floor(ms / MIN);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  let s;
  if (d > 0) s = `${d}d ${h}h`;
  else if (h > 0) s = `${h}h ${String(m).padStart(2, '0')}m`;
  else s = `${m}m`;
  return neg ? `-${s}` : s;
}

/** Live countdown "1:23:45" */
export function fmtCountdown(ms) {
  const neg = ms < 0;
  ms = Math.abs(ms);
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const str = `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return neg ? `+${str}` : str;
}

export function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
export function endOfDay(d = new Date()) {
  const x = startOfDay(d);
  x.setDate(x.getDate() + 1);
  return x;
}

/** Next 9:00 AM after `from` (used by the "Overnight" quick button). */
export function nextMorning(from = new Date(), hour = 9) {
  const x = new Date(from);
  x.setHours(hour, 0, 0, 0);
  if (x <= from) x.setDate(x.getDate() + 1);
  return x;
}

/** Value for <input type="datetime-local"> */
export function toLocalInput(v) {
  const d = toDate(v);
  if (!d) return '';
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * MIN).toISOString().slice(0, 16);
}
export function fromLocalInput(s) {
  return s ? new Date(s) : null;
}
export function toDateInput(v) {
  return toLocalInput(v).slice(0, 10);
}

export function overlaps(aStart, aEnd, bStart, bEnd) {
  return toDate(aStart) < toDate(bEnd) && toDate(bStart) < toDate(aEnd);
}
