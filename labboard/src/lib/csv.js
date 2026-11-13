function esc(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** rows: array of objects; columns: [{ key, label, get? }] */
export function toCSV(rows, columns) {
  const head = columns.map((c) => esc(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => esc(c.get ? c.get(r) : r[c.key])).join(','));
  return [head, ...body].join('\r\n');
}

export function downloadCSV(filename, rows, columns) {
  const blob = new Blob(['﻿' + toCSV(rows, columns)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
