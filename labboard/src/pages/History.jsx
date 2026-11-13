import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../contexts/DataContext';
import { useSessionsRange } from '../hooks/useSessionsRange';
import { downloadCSV } from '../lib/csv';
import { fmtDateTime, fmtDuration, fmtTime, startOfDay, toDate, toDateInput } from '../lib/time';
import { Avatar, Button, Card, EmptyState, FullPageSpinner, Icon, Input, PageHeader, Select } from '../components/ui';

export const SESSION_CSV_COLUMNS = [
  { label: 'Instrument', key: 'instrumentName' },
  { label: 'User', key: 'userName' },
  { label: 'Sample', key: 'sample' },
  { label: 'Started', get: (s) => toDate(s.startedAt)?.toISOString() },
  { label: 'Expected end', get: (s) => toDate(s.expectedEnd)?.toISOString() },
  { label: 'Ended', get: (s) => toDate(s.endedAt)?.toISOString() || '' },
  { label: 'Hours', get: (s) => sessionHours(s).toFixed(2) },
  { label: 'Status', key: 'status' },
  { label: 'Locked parameters', get: (s) => (s.params || []).map((p) => `${p.key}=${p.value}`).join('; ') },
  { label: 'Comments', key: 'comments' },
];

export function sessionHours(s, now = new Date()) {
  const a = toDate(s.startedAt);
  const b = toDate(s.endedAt) || (s.status === 'active' ? now : toDate(s.expectedEnd));
  return a && b ? Math.max(0, (b - a) / 3600e3) : 0;
}

export default function History() {
  const { instruments } = useData();
  const [from, setFrom] = useState(() => toDateInput(new Date(Date.now() - 30 * 864e5)));
  const [to, setTo] = useState(() => toDateInput(new Date()));
  const [instrumentId, setInstrumentId] = useState('');
  const [person, setPerson] = useState('');
  const [q, setQ] = useState('');

  const fromD = startOfDay(new Date(from + 'T00:00'));
  const toD = new Date(startOfDay(new Date(to + 'T00:00')).getTime() + 864e5);
  const { data, loading, error } = useSessionsRange(fromD, toD);

  const people = useMemo(() => [...new Set(data.map((s) => s.userName))].sort(), [data]);
  const rows = data.filter((s) => {
    if (instrumentId && s.instrumentId !== instrumentId) return false;
    if (person && s.userName !== person) return false;
    if (q) {
      const hay = [s.instrumentName, s.userName, s.sample, s.comments, ...(s.params || []).map((p) => p.key + ' ' + p.value)].join(' ').toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="History"
        subtitle="Every session, searchable by instrument, person and date."
        actions={
          <Button variant="secondary" onClick={() => downloadCSV(`labboard-history-${from}_${to}.csv`, rows, SESSION_CSV_COLUMNS)} disabled={!rows.length}>
            <Icon name="download" className="h-4 w-4" /> Export CSV
          </Button>
        }
      />
      <Card className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-5">
        <Input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} aria-label="From" />
        <Input type="date" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} aria-label="To" />
        <Select value={instrumentId} onChange={(e) => setInstrumentId(e.target.value)} aria-label="Instrument">
          <option value="">All instruments</option>
          {instruments.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </Select>
        <Select value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Person">
          <option value="">Everyone</option>
          {people.map((p) => <option key={p}>{p}</option>)}
        </Select>
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sample, comments, parameters…" />
      </Card>

      {loading ? (
        <FullPageSpinner />
      ) : error ? (
        <EmptyState icon="warning" title="Could not load history">{error.message}</EmptyState>
      ) : !rows.length ? (
        <EmptyState icon="history" title="No sessions in this range" />
      ) : (
        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500 dark:border-slate-800">
            {rows.length} sessions · {rows.reduce((h, s) => h + sessionHours(s), 0).toFixed(1)} h total
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((s) => (
              <li key={s.id} className="flex gap-3 px-4 py-3">
                <Avatar src={s.userPhoto} name={s.userName} size="h-9 w-9" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-semibold text-slate-900 dark:text-white">
                      <Link to={`/instrument/${s.instrumentId}`} className="hover:text-indigo-600">{s.instrumentName}</Link>
                      <span className="font-normal text-slate-500"> · {s.userName}</span>
                    </span>
                    <span className="text-xs text-slate-500">
                      {fmtDateTime(s.startedAt)} – {s.endedAt ? fmtTime(s.endedAt) : s.status === 'active' ? 'now' : '?'} · {fmtDuration(sessionHours(s) * 3600e3)}
                      {s.status === 'active' && <span className="ml-1 rounded bg-sky-100 px-1 font-semibold text-sky-700 dark:bg-sky-900 dark:text-sky-200">active</span>}
                    </span>
                  </div>
                  {s.sample && <div className="text-sm text-slate-700 dark:text-slate-300">{s.sample}</div>}
                  {s.params?.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {s.params.map((p, i) => (
                        <span key={i} className="rounded bg-red-50 px-1.5 py-0.5 font-mono text-[11px] text-red-800 dark:bg-red-950 dark:text-red-200">{p.key}: {p.value}</span>
                      ))}
                    </div>
                  )}
                  {s.comments && <div className="mt-1 text-xs text-slate-500">💬 {s.comments}</div>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
