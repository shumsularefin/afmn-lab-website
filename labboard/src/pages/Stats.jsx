import { useMemo, useState } from 'react';
import { useData } from '../contexts/DataContext';
import { useSessionsRange } from '../hooks/useSessionsRange';
import { downloadCSV } from '../lib/csv';
import { toDate } from '../lib/time';
import { Button, Card, EmptyState, FullPageSpinner, Icon, PageHeader, Select } from '../components/ui';
import { sessionHours, SESSION_CSV_COLUMNS } from './History';

const RANGES = {
  '1': 'This month',
  '3': 'Last 3 months',
  '6': 'Last 6 months',
  '12': 'Last 12 months',
};

function Bars({ title, rows, unit = 'h', color = 'bg-indigo-500' }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <Card className="p-5">
      <h2 className="mb-4 font-semibold text-slate-900 dark:text-white">{title}</h2>
      {!rows.length ? (
        <p className="text-sm text-slate-500">No data.</p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((r) => (
            <li key={r.label}>
              <div className="mb-1 flex justify-between gap-2 text-sm">
                <span className="truncate text-slate-700 dark:text-slate-300">{r.label}</span>
                <span className="shrink-0 font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                  {r.value.toFixed(1)} {unit}
                  {r.extra && <span className="ml-1 font-sans font-normal text-slate-400">{r.extra}</span>}
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${(r.value / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function group(sessions, keyFn) {
  const m = new Map();
  for (const s of sessions) {
    const k = keyFn(s);
    const cur = m.get(k) || { label: k, value: 0, count: 0 };
    cur.value += sessionHours(s);
    cur.count++;
    m.set(k, cur);
  }
  return [...m.values()].map((r) => ({ ...r, extra: `· ${r.count}×` }));
}

export default function Stats() {
  const { instruments } = useData();
  const [months, setMonths] = useState('3');
  const from = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() - (Number(months) - 1), 1);
  }, [months]);
  const to = useMemo(() => new Date(Date.now() + 864e5), []);
  const { data, loading, error } = useSessionsRange(from, to, 5000);

  const byInstrument = group(data, (s) => s.instrumentName).sort((a, b) => b.value - a.value);
  const byPerson = group(data, (s) => s.userName).sort((a, b) => b.value - a.value);
  const byMonth = group(data, (s) => {
    const d = toDate(s.startedAt);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((r) => ({ ...r, label: new Date(r.label + '-01T00:00').toLocaleDateString([], { year: 'numeric', month: 'short' }) }));
  const total = data.reduce((h, s) => h + sessionHours(s), 0);
  const idle = instruments.length ? (instruments.length * ((to - from) / 3600e3) - total) / (instruments.length * ((to - from) / 3600e3)) : 0;

  const exportSummary = () =>
    downloadCSV(
      `labboard-stats-${months}m.csv`,
      [
        ...byInstrument.map((r) => ({ group: 'instrument', ...r })),
        ...byPerson.map((r) => ({ group: 'person', ...r })),
        ...byMonth.map((r) => ({ group: 'month', ...r })),
      ],
      [
        { label: 'Group', key: 'group' },
        { label: 'Name', key: 'label' },
        { label: 'Hours', get: (r) => r.value.toFixed(2) },
        { label: 'Sessions', key: 'count' },
      ],
    );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Usage statistics"
        actions={
          <>
            <Select value={months} onChange={(e) => setMonths(e.target.value)} className="w-auto">
              {Object.entries(RANGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <Button variant="secondary" onClick={exportSummary} disabled={!data.length}><Icon name="download" className="h-4 w-4" /> Summary CSV</Button>
            <Button variant="secondary" onClick={() => downloadCSV(`labboard-sessions-${months}m.csv`, data, SESSION_CSV_COLUMNS)} disabled={!data.length}>
              <Icon name="download" className="h-4 w-4" /> Raw CSV
            </Button>
          </>
        }
      />
      {loading ? (
        <FullPageSpinner />
      ) : error ? (
        <EmptyState icon="warning" title="Could not load statistics">{error.message}</EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Sessions', data.length],
              ['Hours used', total.toFixed(0)],
              ['People', byPerson.length],
              ['Idle capacity', `${Math.max(0, Math.round(idle * 100))}%`],
            ].map(([l, v]) => (
              <Card key={l} className="p-4">
                <div className="text-3xl font-extrabold text-slate-900 dark:text-white">{v}</div>
                <div className="text-xs font-medium text-slate-500">{l}</div>
              </Card>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Bars title="Hours per instrument" rows={byInstrument} />
            <Bars title="Hours per person" rows={byPerson} color="bg-sky-500" />
          </div>
          <Bars title="Hours per month" rows={byMonth} color="bg-emerald-500" />
        </>
      )}
    </div>
  );
}
