import { useCallback } from 'react';
import { useData } from '../contexts/DataContext';
import { useToast } from '../contexts/ToastContext';
import { conflictForExtension, extendSession, finishSession } from '../lib/data';
import { toDate, fmtTime } from '../lib/time';

export function useSessionActions() {
  const { bookings } = useData();
  const toast = useToast();

  const finish = useCallback(
    async (s) => {
      try {
        await finishSession(s);
        toast.success(`Finished on ${s.instrumentName}. Thanks!`);
        return true;
      } catch (e) {
        toast.error(e);
        return false;
      }
    },
    [toast],
  );

  /** Extends from max(now, expectedEnd) by `ms`, or to an absolute Date. */
  const extend = useCallback(
    async (s, msOrDate = 3600e3) => {
      const base = Math.max(Date.now(), toDate(s.expectedEnd).getTime());
      const newEnd = msOrDate instanceof Date ? msOrDate : new Date(base + msOrDate);
      const clash = conflictForExtension(s, newEnd, bookings);
      if (clash && !window.confirm(`${clash.userName} has booked this instrument from ${fmtTime(clash.start)}. Extend anyway and talk to them?`)) {
        return false;
      }
      try {
        await extendSession(s, newEnd);
        toast.success(`Extended to ${fmtTime(newEnd)}`);
        return true;
      } catch (e) {
        toast.error(e);
        return false;
      }
    },
    [bookings, toast],
  );

  return { finish, extend };
}
