import { useEffect, useMemo, useState } from 'react';
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
  // Type/room filters are remembered on this device, so people who only care about their room set it once.
  const [filters, setFilters] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('lb-filters') || '{}');
      return { ...EMPTY_FILTERS, type: saved.type || '', room: saved.room || '' };
    } catch {
      return EMPTY_FILTERS;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('lb-filters', JSON.stringify({ type: filters.type, room: filters.room }));
    } catch {
      /* private mode: just don't remember */
    }
  }, [filters.type, filters.room]);
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
        <h1 className="text-[30px] font-bold leading-tight tracking-tight text-slate-900 dark:text-white lg:text-[28px]">Lab status</h1>
      </div>

      <SummaryStrip counts={counts} active={group} onSelect={setGroup} />
      <FilterBar instruments={instruments} filters={filters} onChange={setFilters} />

      {!filtered.length && <EmptyState icon="search" title="Nothing matches your filters" />}

      {GROUP_ORDER.map((k) => {
        const items = filtered.filter(({ d }) => d.kind === k).sort((a, b) => (b.d.session?.userId === profile.uid) - (a.d.session?.userId === profile.uid));
        if (!items.length) return null;
        return (
          <section key={k}>
            <h2 className="mb-2.5 flex items-center gap-2 px-0.5 text-[17px] font-semibold text-slate-900 dark:text-white">
              <span className={`h-2.5 w-2.5 rounded-full ${STATUS[k].dot}`} /> {GROUP_TITLE[k]} <span className="font-normal text-slate-400">{items.length}</span>
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
