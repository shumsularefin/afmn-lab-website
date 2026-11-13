import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useNow } from '../hooks/useNow';
import { useSessionActions } from '../hooks/useSessionActions';
import { useToast } from '../contexts/ToastContext';
import { updateSession, cancelBooking } from '../lib/data';
import { requestNotificationPermission } from '../hooks/useReminders';
import { bookingIsLive } from '../lib/status';
import { fmtCountdown, fmtDateTime, fmtTime, fmtDuration, toDate, HOUR, MIN } from '../lib/time';
import { Button, Card, EmptyState, Icon, PageHeader, Textarea, cx } from '../components/ui';
import { LockedParams } from '../components/LockedParams';
import { ParamEditor } from '../components/ParamEditor';
import { EndTimePicker } from '../components/EndTimePicker';

export default function MySession() {
  const { profile } = useAuth();
  const { activeSessions, bookings } = useData();
  const now = useNow(1000);
  const mine = activeSessions.filter((s) => s.userId === profile.uid).sort((a, b) => toDate(a.expectedEnd) - toDate(b.expectedEnd));
  const myBookings = bookings
    .filter((b) => b.userId === profile.uid && b.status === 'booked' && bookingIsLive(b, now))
    .sort((a, b) => toDate(a.start) - toDate(b.start));
  const notifState = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="My session"
        actions={
          notifState === 'default' && (
            <Button variant="secondary" size="sm" onClick={requestNotificationPermission}>
              <Icon name="bell" className="h-4 w-4" /> Enable reminders
            </Button>
          )
        }
      />
      {!mine.length && (
        <EmptyState icon="play" title="No active session">
          <Link to="/start" className="font-semibold text-indigo-600 hover:underline">Start a session</Link>
        </EmptyState>
      )}
      {mine.map((s) => <SessionPanel key={s.id} s={s} now={now} />)}

      {myBookings.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-3 font-semibold text-slate-900 dark:text-white">My upcoming bookings</h2>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {myBookings.map((b) => {
              const startable = toDate(b.start) - now < 30 * MIN;
              return (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div>
                    <div className="font-medium text-slate-900 dark:text-white">{b.instrumentName}</div>
                    <div className="text-sm text-slate-500">{fmtDateTime(b.start)} – {fmtTime(b.end)}{b.purpose && ` · ${b.purpose}`}</div>
                  </div>
                  <div className="flex gap-2">
                    {startable && <Link to={`/start?instrument=${b.instrumentId}`} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white">Start now</Link>}
                    <Button variant="ghost" size="sm" onClick={() => window.confirm('Cancel this booking?') && cancelBooking(b)}>Cancel</Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}

function SessionPanel({ s, now }) {
  const { finish, extend } = useSessionActions();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [comments, setComments] = useState(s.comments || '');
  const [params, setParams] = useState(s.params || []);
  const [custom, setCustom] = useState(false);
  const [newEnd, setNewEnd] = useState(toDate(s.expectedEnd));
  const [busy, setBusy] = useState(false);

  const remaining = toDate(s.expectedEnd) - now;
  const overdue = remaining < 0;

  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  async function saveEdits() {
    await run(async () => {
      try {
        await updateSession(s.id, { comments, params });
        toast.success('Saved');
        setEditing(false);
      } catch (e) {
        toast.error(e);
      }
    });
  }

  return (
    <Card className={cx('overflow-hidden', overdue && 'ring-2 ring-orange-500')}>
      <div className={cx('p-5 text-white', overdue ? 'bg-gradient-to-r from-orange-500 to-amber-500' : 'bg-gradient-to-r from-indigo-600 to-sky-500')}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link to={`/instrument/${s.instrumentId}`} className="text-xl font-bold hover:underline">{s.instrumentName}</Link>
            <div className="text-sm opacity-90">{s.sample || 'No sample name'}</div>
          </div>
          <div className="text-right">
            <div className="font-mono text-4xl font-extrabold tabular-nums">{fmtCountdown(remaining)}</div>
            <div className="text-xs font-semibold uppercase tracking-wide opacity-90">{overdue ? 'over expected end' : 'remaining'}</div>
          </div>
        </div>
        <div className="mt-2 text-sm opacity-90">
          Started {fmtTime(s.startedAt)} · expected end {fmtDateTime(s.expectedEnd)} · running {fmtDuration(now - (toDate(s.startedAt) || now))}
        </div>
      </div>

      <div className="space-y-4 p-5">
        {overdue && (
          <div className="rounded-xl bg-orange-50 p-3 text-sm font-medium text-orange-800 dark:bg-orange-950 dark:text-orange-200">
            Your session is past its expected end. Please finish it, or extend if it's still running, so the board stays correct.
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Button size="xl" variant="success" className="col-span-2" loading={busy} onClick={() => run(() => finish(s))}>
            <Icon name="check" className="h-6 w-6" /> Finish
          </Button>
          <Button size="xl" variant="secondary" disabled={busy} onClick={() => run(() => extend(s, 30 * MIN))}>+30m</Button>
          <Button size="xl" variant="secondary" disabled={busy} onClick={() => run(() => extend(s, HOUR))}>+1h</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {[3, 6, 12].map((h) => (
            <Button key={h} variant="ghost" size="sm" disabled={busy} onClick={() => run(() => extend(s, h * HOUR))}>+{h}h</Button>
          ))}
          <Button variant="ghost" size="sm" onClick={() => setCustom((c) => !c)}>Set exact end…</Button>
        </div>
        {custom && (
          <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
            <EndTimePicker value={newEnd} onChange={setNewEnd} />
            <Button className="mt-3" size="sm" disabled={!newEnd || newEnd <= new Date()} onClick={() => run(async () => (await extend(s, newEnd)) && setCustom(false))}>
              Save end time
            </Button>
          </div>
        )}

        {editing ? (
          <div className="space-y-3">
            <div className="text-sm font-medium text-red-700 dark:text-red-400">Locked parameters</div>
            <ParamEditor value={params} onChange={setParams} />
            <Textarea value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Comments for others" />
            <div className="flex gap-2">
              <Button onClick={saveEdits} loading={busy}>Save</Button>
              <Button variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <>
            <LockedParams params={s.params} />
            {s.comments ? <p className="whitespace-pre-line rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">💬 {s.comments}</p> : null}
            <Button variant="secondary" size="sm" onClick={() => { setComments(s.comments || ''); setParams(s.params || []); setEditing(true); }}>
              <Icon name="edit" className="h-4 w-4" /> Edit comments & parameters
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
