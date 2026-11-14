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
      // Firestore applies the write to the on-screen data immediately; the server confirms in the
      // background. Only a refusal (e.g. permissions) needs to be shown.
      finishSession(s).catch((e) => toast.error(e));
      toast.success(`Finished on ${s.instrumentName}. Thanks!`);
      return true;
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
      extendSession(s, newEnd).catch((e) => toast.error(e));
      toast.success(`Extended to ${fmtTime(newEnd)}`);
      return true;
    },
    [bookings, toast],
  );

  return { finish, extend };
}
