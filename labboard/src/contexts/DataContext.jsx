import { createContext, useContext, useEffect, useMemo } from 'react';
import { collection, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useLiveQuery } from '../hooks/useQuery';
import { useAuth } from './AuthContext';
import { useNow } from '../hooks/useNow';
import { releaseNoShows } from '../lib/data';
import { startOfDay } from '../lib/time';
import { bookingIsNoShow } from '../lib/status';

const DataCtx = createContext(null);

/**
 * App-wide real-time listeners. Kept deliberately small so a lab of ~30
 * people stays far below the Spark plan's 50k reads/day.
 */
export function DataProvider({ children }) {
  const { isApproved } = useAuth();
  const dayKey = startOfDay().getTime(); // re-subscribe bookings once per day
  const now = useNow(60 * 1000);

  const instruments = useLiveQuery(() => (isApproved ? collection(db, 'instruments') : null), [isApproved]);
  const activeSessions = useLiveQuery(
    () => (isApproved ? query(collection(db, 'sessions'), where('status', '==', 'active')) : null),
    [isApproved],
  );
  const bookings = useLiveQuery(
    () => (isApproved ? query(collection(db, 'bookings'), where('end', '>=', new Date(dayKey - 24 * 3600e3))) : null),
    [isApproved, dayKey],
  );
  const maintenance = useLiveQuery(() => (isApproved ? collection(db, 'maintenance') : null), [isApproved]);
  const openIssues = useLiveQuery(
    () => (isApproved ? query(collection(db, 'issues'), where('status', '==', 'open')) : null),
    [isApproved],
  );

  // Auto-release no-show bookings (client-side, because Cloud Functions need Blaze).
  useEffect(() => {
    if (!isApproved) return;
    if (bookings.data.some((b) => bookingIsNoShow(b, now))) releaseNoShows(bookings.data);
  }, [bookings.data, now, isApproved]);

  const value = useMemo(() => {
    const sortedInstruments = [...instruments.data].sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.name.localeCompare(b.name));
    const sessionsByInstrument = {};
    for (const s of activeSessions.data) sessionsByInstrument[s.instrumentId] = s;
    const instrumentsById = Object.fromEntries(sortedInstruments.map((i) => [i.id, i]));
    return {
      instruments: sortedInstruments,
      instrumentsById,
      activeSessions: activeSessions.data,
      sessionsByInstrument,
      bookings: bookings.data,
      maintenance: maintenance.data,
      openIssues: openIssues.data,
      loading: instruments.loading || activeSessions.loading,
      error: instruments.error || activeSessions.error || bookings.error,
    };
  }, [instruments, activeSessions, bookings, maintenance, openIssues]);

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

export const useData = () => useContext(DataCtx);
