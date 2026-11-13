import { useMemo, useState } from 'react';
import { collection, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useLiveQuery } from '../hooks/useQuery';
import { useNow } from '../hooks/useNow';
import { deriveInstrument } from '../lib/status';
import { startOfDay, endOfDay, toDateInput } from '../lib/time';
import { DayTimeline } from '../components/DayTimeline';
import { FilterBar, applyFilters, EMPTY_FILTERS } from '../components/FilterBar';
import { Button, Input, PageHeader } from '../components/ui';

export default function Timeline() {
  const { profile } = useAuth();
  const { instruments, sessionsByInstrument, bookings, activeSessions } = useData();
  const now = useNow(30 * 1000);
  const [day, setDay] = useState(() => startOfDay());
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  const daySessions = useLiveQuery(
    () => query(collection(db, 'sessions'), where('startedAt', '>=', startOfDay(day)), where('startedAt', '<', endOfDay(day))),
    [day.getTime()],
  );

  const items = useMemo(
    () => applyFilters(instruments.map((inst) => ({ inst, d: deriveInstrument(inst, sessionsByInstrument, bookings, now) })), filters),
    [instruments, sessionsByInstrument, bookings, now, filters],
  );
  const shift = (n) => setDay((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
  const isToday = startOfDay().getTime() === day.getTime();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Day timeline"
        subtitle={day.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => shift(-1)}>‹ Prev</Button>
            <Button variant={isToday ? 'primary' : 'secondary'} size="sm" onClick={() => setDay(startOfDay())}>Today</Button>
            <Button variant="secondary" size="sm" onClick={() => shift(1)}>Next ›</Button>
            <Input type="date" value={toDateInput(day)} onChange={(e) => e.target.value && setDay(startOfDay(new Date(e.target.value + 'T00:00')))} className="w-auto" />
          </>
        }
      />
      <FilterBar instruments={instruments} filters={filters} onChange={setFilters} />
      <DayTimeline
        instruments={items.map((x) => x.inst)}
        day={day}
        bookings={bookings}
        activeSessions={activeSessions}
        daySessions={daySessions.data}
        now={now}
        myUid={profile.uid}
      />
    </div>
  );
}
