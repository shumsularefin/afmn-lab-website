import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useNow } from '../hooks/useNow';
import { useSessionActions } from '../hooks/useSessionActions';
import { deriveInstrument, summaryGroup, STATUS } from '../lib/status';
import { SummaryStrip } from '../components/SummaryStrip';
import { InstrumentCard } from '../components/InstrumentCard';
import { FilterBar, applyFilters, EMPTY_FILTERS } from '../components/FilterBar';
import { EmptyState, FullPageSpinner, Icon } from '../components/ui';

const GROUP_ORDER = ['overdue', 'busy', 'free', 'booked', 'oos'];
const GROUP_TITLE = { overdue: 'Overdue – needs confirmation', busy: 'In use', free: 'Free now', booked: 'Booked later today', oos: 'Out of service' };

export function useDerived(now) {
  const { instruments, sessionsByInstrument, bookings } = useData();
  return useMemo(
    () => instruments.map((inst) => ({ inst, d: deriveInstrument(inst, sessionsByInstrument, bookings, now) })),
    [instruments, sessionsByInstrument, bookings, now],
  );
}

export function countKinds(items) {
  const c = { free: 0, busy: 0, booked: 0, oos: 0, overdue: 0 };
  for (const { d } of items) {
    c[summaryGroup(d.kind)]++;
    if (d.kind === 'overdue') c.overdue++;
  }
  return c;
}

export default function Dashboard() {
  const { profile, isAdmin } = useAuth();
  const { loading, error, instruments, openIssues } = useData();
  const { finish, extend } = useSessionActions();
  const now = useNow(1000);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [group, setGroup] = useState(null);

  const all = useDerived(now);
  const counts = countKinds(all);
  const filtered = applyFilters(all, filters).filter(({ d }) => !group || summaryGroup(d.kind) === group);
  const issuesBy = openIssues.reduce((m, i) => ((m[i.instrumentId] = (m[i.instrumentId] || 0) + 1), m), {});

  if (loading) return <FullPageSpinner label="Loading the board…" />;
  if (error) return <EmptyState icon="warning" title="Could not load data">{error.message}</EmptyState>;
  if (!instruments.length)
    return (
      <EmptyState icon="inbox" title="No instruments yet">
        {isAdmin ? <>Go to <Link className="text-indigo-600 underline" to="/admin">Admin</Link> to add instruments or load sample data.</> : 'An admin needs to add instruments first.'}
      </EmptyState>
    );

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Lab status</h1>
        <span className="font-mono text-sm tabular-nums text-slate-500">{now.toLocaleTimeString()}</span>
      </div>

      <SummaryStrip counts={counts} active={group} onSelect={setGroup} />
      <FilterBar instruments={instruments} filters={filters} onChange={setFilters} />

      {!filtered.length && <EmptyState icon="search" title="Nothing matches your filters" />}

      {GROUP_ORDER.map((k) => {
        const items = filtered.filter(({ d }) => d.kind === k);
        if (!items.length) return null;
        return (
          <section key={k}>
            <h2 className={`mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide ${STATUS[k].text}`}>
              <span className={`h-2 w-2 rounded-full ${STATUS[k].dot}`} /> {GROUP_TITLE[k]} <span className="text-slate-400">({items.length})</span>
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {items.map(({ inst, d }) => (
                <InstrumentCard
                  key={inst.id}
                  inst={inst}
                  d={d}
                  now={now}
                  myUid={profile.uid}
                  openIssueCount={issuesBy[inst.id]}
                  onFinish={finish}
                  onExtend={(s) => extend(s, 3600e3)}
                />
              ))}
            </div>
          </section>
        );
      })}

      <div className="flex justify-center pt-4">
        <Link to="/board" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-indigo-600">
          <Icon name="tv" className="h-4 w-4" /> Open big-screen mode for the lab monitor
        </Link>
      </div>
    </div>
  );
}
