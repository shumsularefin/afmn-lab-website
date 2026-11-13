import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useToast } from '../contexts/ToastContext';
import { useNow } from '../hooks/useNow';
import { canUseInstrument, cancelBooking, createBooking } from '../lib/data';
import { bookingIsLive, DEFAULT_MAX_BOOKING_HOURS, AUTO_RELEASE_MIN } from '../lib/status';
import { fmtTime, fmtDateTime, startOfDay, toDate, toLocalInput, fromLocalInput, HOUR } from '../lib/time';
import { Avatar, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, cx } from '../components/ui';

const DAY_START_H = 6;
const DAY_END_H = 24;
const ROW_PX = 36;

export default function Bookings() {
  const { profile, isMember, isAdmin } = useAuth();
  const { instruments, instrumentsById, bookings, sessionsByInstrument } = useData();
  const toast = useToast();
  const now = useNow(60 * 1000);
  const [params, setParams] = useSearchParams();
  const instrumentId = params.get('instrument') || instruments[0]?.id || '';
  const inst = instrumentsById[instrumentId];
  const [weekStart, setWeekStart] = useState(() => startOfDay());
  const [draft, setDraft] = useState(null); // { start, end, purpose }
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const days = Array.from({ length: 7 }, (_, i) => new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i));
  const live = useMemo(() => bookings.filter((b) => ['booked', 'started'].includes(b.status) && bookingIsLive(b, now)), [bookings, now]);
  const forInst = live.filter((b) => b.instrumentId === instrumentId);
  const session = sessionsByInstrument[instrumentId];
  const maxH = inst?.maxBookingHours || DEFAULT_MAX_BOOKING_HOURS;
  const allowed = inst && canUseInstrument(inst, profile);

  function openDraft(start) {
    if (!isMember) return toast.info('Guests cannot book. Ask an admin for member access.');
    if (!allowed) return toast.error(inst?.status === 'out_of_service' ? 'Instrument is out of service.' : 'You need training approval to book this instrument.');
    // Never in the past; round up to the next 5 minutes.
    const t = Math.max(start.getTime(), Date.now());
    const s = new Date(Math.ceil(t / (5 * 60e3)) * 5 * 60e3);
    setDraft({ start: s, end: new Date(s.getTime() + HOUR), purpose: '' });
  }

  async function save() {
    setBusy(true);
    try {
      await createBooking({ instrument: inst, profile, start: draft.start, end: draft.end, purpose: draft.purpose, activeSession: session });
      toast.success('Booked!');
      setDraft(null);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  const myUpcoming = live.filter((b) => (showAll || b.userId === profile.uid) && toDate(b.end) > now).sort((a, b) => toDate(a.start) - toDate(b.start));
  const hours = Array.from({ length: DAY_END_H - DAY_START_H }, (_, i) => DAY_START_H + i);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Bookings"
        subtitle={`Tap a free slot to reserve. Max ${maxH} h per booking · bookings are released if not started within ${AUTO_RELEASE_MIN} min.`}
        actions={isMember && inst && <Button onClick={() => openDraft(new Date())}>+ New booking</Button>}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Select value={instrumentId} onChange={(e) => setParams({ instrument: e.target.value })} className="w-auto min-w-[14rem]" aria-label="Instrument">
          {instruments.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}{i.status === 'out_of_service' ? ' (out of service)' : ''}{i.restricted ? ' 🎓' : ''}
            </option>
          ))}
        </Select>
        <div className="ml-auto flex gap-1">
          <Button variant="secondary" size="sm" onClick={() => setWeekStart((d) => new Date(d.getTime() - 7 * 24 * HOUR))} disabled={weekStart <= startOfDay()}>‹</Button>
          <Button variant="secondary" size="sm" onClick={() => setWeekStart(startOfDay())}>This week</Button>
          <Button variant="secondary" size="sm" onClick={() => setWeekStart((d) => new Date(d.getTime() + 7 * 24 * HOUR))}>›</Button>
        </div>
      </div>

      {inst && !allowed && isMember && (
        <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          {inst.status === 'out_of_service' ? `Out of service: ${inst.outOfServiceReason}` : `Training required: ${inst.requiredTraining || 'ask an admin'}. An admin must approve you before you can book.`}
        </div>
      )}

      {!inst ? (
        <EmptyState title="No instruments yet" />
      ) : (
        <Card className="overflow-x-auto">
          <div className="grid min-w-[48rem]" style={{ gridTemplateColumns: `3.5rem repeat(7, minmax(0, 1fr))` }}>
            <div />
            {days.map((d) => (
              <div key={d.toISOString()} className={cx('border-b border-l border-slate-100 py-2 text-center text-xs font-semibold dark:border-slate-800', d.toDateString() === now.toDateString() ? 'text-indigo-600' : 'text-slate-500')}>
                {d.toLocaleDateString([], { weekday: 'short' })}
                <div className="text-base text-slate-900 dark:text-white">{d.getDate()}</div>
              </div>
            ))}
            <div className="relative">
              {hours.map((h) => (
                <div key={h} className="pr-1 text-right text-[10px] text-slate-400" style={{ height: ROW_PX }}>
                  {String(h).padStart(2, '0')}:00
                </div>
              ))}
            </div>
            {days.map((d) => {
              const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), DAY_START_H).getTime();
              const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), DAY_END_H).getTime();
              const top = (t) => ((Math.max(dayStart, Math.min(dayEnd, toDate(t).getTime())) - dayStart) / HOUR) * ROW_PX;
              const blocks = forInst.filter((b) => toDate(b.end).getTime() > dayStart && toDate(b.start).getTime() < dayEnd);
              const sess = session && toDate(session.expectedEnd).getTime() > dayStart && (toDate(session.startedAt)?.getTime() ?? now.getTime()) < dayEnd ? session : null;
              return (
                <div key={d.toISOString()} className="relative border-l border-slate-100 dark:border-slate-800">
                  {hours.map((h) => {
                    const slot = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h);
                    const past = slot.getTime() + HOUR <= now.getTime();
                    return (
                      <button
                        key={h}
                        type="button"
                        disabled={past}
                        onClick={() => openDraft(slot)}
                        className={cx('block w-full border-b border-slate-50 dark:border-slate-800/50', past ? 'bg-slate-50 dark:bg-slate-900' : 'hover:bg-indigo-50 dark:hover:bg-indigo-950/40')}
                        style={{ height: ROW_PX }}
                        aria-label={`Book ${slot.toLocaleString()}`}
                      />
                    );
                  })}
                  {sess && (
                    <div className="pointer-events-none absolute inset-x-1 overflow-hidden rounded-md bg-sky-500 px-1 text-[11px] font-semibold text-white" style={{ top: top(sess.startedAt || now), height: Math.max(14, top(sess.expectedEnd) - top(sess.startedAt || now)) }}>
                      In use · {sess.userName}
                    </div>
                  )}
                  {blocks.map((b) => (
                    <div
                      key={b.id}
                      title={`${b.userName}: ${fmtTime(b.start)}–${fmtTime(b.end)} ${b.purpose || ''}`}
                      className={cx('absolute inset-x-1 overflow-hidden rounded-md px-1 py-0.5 text-[11px] font-semibold text-white shadow', b.userId === profile.uid ? 'bg-indigo-600' : 'bg-violet-500')}
                      style={{ top: top(b.start), height: Math.max(14, top(b.end) - top(b.start)) }}
                    >
                      {fmtTime(b.start)} {b.userName}
                      {b.purpose && <div className="truncate font-normal opacity-90">{b.purpose}</div>}
                    </div>
                  ))}
                  {d.toDateString() === now.toDateString() && now.getHours() >= DAY_START_H && (
                    <div className="pointer-events-none absolute inset-x-0 h-0.5 bg-rose-500" style={{ top: top(now) }} />
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900 dark:text-white">{showAll ? 'All upcoming bookings' : 'My upcoming bookings'}</h2>
          <button className="text-sm font-medium text-indigo-600" onClick={() => setShowAll((x) => !x)}>{showAll ? 'Show mine' : 'Show everyone'}</button>
        </div>
        {!myUpcoming.length ? (
          <p className="text-sm text-slate-500">Nothing booked.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {myUpcoming.map((b) => (
              <li key={b.id} className="flex items-center gap-3 py-2">
                <Avatar src={b.userPhoto} name={b.userName} size="h-8 w-8" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-slate-900 dark:text-white">{b.instrumentName}</div>
                  <div className="truncate text-sm text-slate-500">
                    {b.userName} · {fmtDateTime(b.start)} – {fmtTime(b.end)} {b.status === 'started' && '· started'} {b.purpose && `· ${b.purpose}`}
                  </div>
                </div>
                {(b.userId === profile.uid || isAdmin) && b.status === 'booked' && (
                  <Button variant="ghost" size="sm" onClick={() => window.confirm('Cancel this booking?') && cancelBooking(b).catch(toast.error)}>Cancel</Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={Boolean(draft)}
        onClose={() => setDraft(null)}
        title={`Book ${inst?.name || ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDraft(null)}>Cancel</Button>
            <Button onClick={save} loading={busy}>Book</Button>
          </>
        }
      >
        {draft && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start">
                <Input
                  type="datetime-local"
                  value={toLocalInput(draft.start)}
                  onChange={(e) => {
                    const s = fromLocalInput(e.target.value);
                    if (s) setDraft((x) => ({ ...x, start: s, end: new Date(s.getTime() + (x.end - x.start)) }));
                  }}
                />
              </Field>
              <Field label="End">
                <Input type="datetime-local" value={toLocalInput(draft.end)} onChange={(e) => setDraft((x) => ({ ...x, end: fromLocalInput(e.target.value) }))} />
              </Field>
            </div>
            <div className="flex flex-wrap gap-2">
              {[0.5, 1, 2, 3, 4, 8, 12, 24].filter((h) => h <= maxH).map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setDraft((x) => ({ ...x, end: new Date(x.start.getTime() + h * HOUR) }))}
                  className={cx(
                    'rounded-lg px-3 py-1.5 text-sm font-semibold ring-1 ring-inset',
                    draft.end - draft.start === h * HOUR ? 'bg-indigo-600 text-white ring-indigo-600' : 'ring-slate-300 dark:ring-slate-700',
                  )}
                >
                  {h < 1 ? '30m' : `${h}h`}
                </button>
              ))}
            </div>
            <Field label="Purpose (optional)">
              <Input value={draft.purpose} onChange={(e) => setDraft((x) => ({ ...x, purpose: e.target.value }))} placeholder="e.g. Time-lapse, 12 positions" />
            </Field>
            <p className="text-xs text-slate-500">
              {fmtDateTime(draft.start)} → {fmtDateTime(draft.end)}. Max {maxH} h. If you don't start a session within {AUTO_RELEASE_MIN} minutes of the start, the booking is released automatically.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
