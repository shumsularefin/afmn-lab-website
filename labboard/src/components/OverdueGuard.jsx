import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useNow } from '../hooks/useNow';
import { useSessionActions } from '../hooks/useSessionActions';
import { fmtDuration, fmtTime, toDate, MIN } from '../lib/time';
import { Button, Modal } from './ui';

/** Pops up whenever one of *your* sessions passes its expected end. */
export function OverdueGuard() {
  const { profile } = useAuth();
  const { activeSessions } = useData();
  const { finish, extend } = useSessionActions();
  const now = useNow(15 * 1000);
  const [snoozed, setSnoozed] = useState({});
  const [busy, setBusy] = useState(false);

  const overdue = activeSessions.find(
    (s) => s.userId === profile?.uid && toDate(s.expectedEnd) < now && !(snoozed[s.id] && snoozed[s.id] > now.getTime()),
  );
  if (!overdue) return null;

  const run = async (fn) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };

  return (
    <Modal open title="⏰ Is your session still running?" onClose={() => setSnoozed((x) => ({ ...x, [overdue.id]: Date.now() + 15 * MIN }))}>
      <p className="text-slate-700 dark:text-slate-200">
        Your session on <b>{overdue.instrumentName}</b> was expected to end at <b>{fmtTime(overdue.expectedEnd)}</b> ({fmtDuration(now - toDate(overdue.expectedEnd))} ago).
        Others see it as <span className="font-semibold text-orange-600">overdue</span> until you confirm.
      </p>
      <div className="mt-5 grid gap-2">
        <Button size="lg" variant="success" loading={busy} onClick={() => run(() => finish(overdue))}>✓ I'm done – Finish now</Button>
        <div className="grid grid-cols-3 gap-2">
          {[['+30m', 30 * MIN], ['+1h', 60 * MIN], ['+3h', 180 * MIN]].map(([l, ms]) => (
            <Button key={l} variant="secondary" size="lg" disabled={busy} onClick={() => run(() => extend(overdue, ms))}>
              Still running {l}
            </Button>
          ))}
        </div>
        <button className="mt-1 text-sm text-slate-500 hover:underline" onClick={() => setSnoozed((x) => ({ ...x, [overdue.id]: Date.now() + 15 * MIN }))}>
          Remind me in 15 minutes
        </button>
      </div>
    </Modal>
  );
}
