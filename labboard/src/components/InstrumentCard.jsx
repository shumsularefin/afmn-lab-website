import { Link } from 'react-router-dom';
import { STATUS, AUTO_RELEASE_MIN } from '../lib/status';
import { fmtCountdown, fmtDuration, fmtTime, fmtDateTime, toDate, MIN } from '../lib/time';
import { Avatar, Badge, Icon, cx } from './ui';
import { LockedParams } from './LockedParams';
import { IssueButton } from './IssueButton';

export function InstrumentCard({ inst, d, now, myUid, openIssueCount = 0, big = false, onFinish, onExtend }) {
  const st = STATUS[d.kind];
  const s = d.session;
  const mine = s && s.userId === myUid;
  const remaining = s ? toDate(s.expectedEnd) - now : 0;

  return (
    <div
      className={cx(
        'relative flex min-w-0 flex-col rounded-2xl bg-white shadow-sm ring-1 transition dark:bg-slate-900',
        d.kind === 'overdue' ? 'ring-2 ring-orange-500 bg-orange-50/60 dark:bg-orange-950/30' : 'ring-slate-200 dark:ring-slate-800',
        big ? 'p-6' : 'p-4',
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <span className={cx('mt-1.5 h-3 w-3 shrink-0 rounded-full', st.dot, (d.kind === 'busy' || d.kind === 'overdue') && 'animate-pulse')} />
        <div className="min-w-0 flex-1">
          <Link to={`/instrument/${inst.id}`} className={cx('block truncate font-bold text-slate-900 hover:text-indigo-600 dark:text-white', big ? 'text-2xl' : 'text-base')}>
            {inst.name}
          </Link>
          <div className={cx('truncate text-slate-500 dark:text-slate-400', big ? 'text-base' : 'text-xs')}>
            {[inst.type, inst.room].filter(Boolean).join(' · ')}
            {inst.restricted && <span title="Training required"> · 🎓</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {openIssueCount > 0 && <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">⚠ {openIssueCount}</Badge>}
          <Badge className={st.chip}>{d.kind === 'booked' ? 'Booked' : st.label}</Badge>
          {!big && <IssueButton instrument={inst} compact />}
        </div>
      </div>

      <div className={cx('mt-3 flex-1 space-y-3', big && 'text-lg')}>
        {/* FREE */}
        {d.kind === 'free' && (
          <>
            <p className="text-emerald-700 dark:text-emerald-300">
              <span className="font-semibold">Free</span>
              {d.freeForMs != null && <> for {fmtDuration(d.freeForMs)}</>}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {d.nextBooking ? <>Next booking: <b>{d.nextBooking.userName}</b> {fmtDateTime(d.nextBooking.start)}</> : 'No upcoming bookings'}
            </p>
          </>
        )}

        {/* IN USE / OVERDUE */}
        {s && (
          <>
            <div className="flex items-center gap-3">
              <Avatar src={s.userPhoto} name={s.userName} size={big ? 'h-14 w-14' : 'h-10 w-10'} />
              <div className="min-w-0">
                <div className="truncate font-semibold text-slate-900 dark:text-white">{s.userName}{mine && <span className="ml-1 text-xs text-indigo-600">(you)</span>}</div>
                <div className="truncate text-sm text-slate-600 dark:text-slate-300">{s.sample || <i className="text-slate-400">No sample name</i>}</div>
              </div>
            </div>
            <div className="flex items-end justify-between gap-2">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Started {fmtTime(s.startedAt)}
                <br />
                Ends {fmtDateTime(s.expectedEnd)}
              </div>
              <div className={cx('text-right font-mono font-bold tabular-nums', d.overdue ? 'text-orange-600' : 'text-sky-700 dark:text-sky-300', big ? 'text-4xl' : 'text-2xl')}>
                {fmtCountdown(remaining)}
                <div className="font-sans text-[10px] font-semibold uppercase tracking-wide opacity-70">{d.overdue ? 'over time' : 'remaining'}</div>
              </div>
            </div>
            {d.overdue && (
              <div className="rounded-xl bg-orange-100 px-3 py-2 text-sm font-semibold text-orange-800 dark:bg-orange-900/60 dark:text-orange-100">
                ⏰ Past expected end by {fmtDuration(-remaining)} — {mine ? 'please confirm or finish.' : `${s.userName.split(' ')[0]} has been asked to confirm.`}
              </div>
            )}
            <LockedParams params={s.params} big={big} />
            {s.comments && <p className="whitespace-pre-line rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">💬 {s.comments}</p>}
            {d.nextBooking && <p className="text-xs text-slate-500">Next: {d.nextBooking.userName} {fmtDateTime(d.nextBooking.start)}</p>}
          </>
        )}

        {/* BOOKED */}
        {d.kind === 'booked' && (
          <div className="space-y-1">
            {d.currentBooking ? (
              <>
                <p className="flex items-center gap-2">
                  <Avatar src={d.currentBooking.userPhoto} name={d.currentBooking.userName} size="h-7 w-7" />
                  <span><b>{d.currentBooking.userName}</b> reserved until {fmtTime(d.currentBooking.end)}</span>
                </p>
                <p className="text-xs text-violet-700 dark:text-violet-300">
                  Not started yet · auto-releases at {fmtTime(new Date(toDate(d.currentBooking.start).getTime() + AUTO_RELEASE_MIN * MIN))}
                </p>
              </>
            ) : (
              <>
                <p className="text-emerald-700 dark:text-emerald-300">
                  <span className="font-semibold">Free</span> until {fmtTime(d.nextBooking.start)} ({fmtDuration(d.freeAheadMs)})
                </p>
                <p className="flex items-center gap-2 text-sm">
                  <Avatar src={d.nextBooking.userPhoto} name={d.nextBooking.userName} size="h-6 w-6" />
                  <span><b>{d.nextBooking.userName}</b> booked {fmtTime(d.nextBooking.start)}–{fmtTime(d.nextBooking.end)}</span>
                </p>
              </>
            )}
            {(d.currentBooking || d.nextBooking)?.purpose && <p className="text-xs text-slate-500">“{(d.currentBooking || d.nextBooking).purpose}”</p>}
          </div>
        )}

        {/* OUT OF SERVICE */}
        {d.kind === 'oos' && (
          <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:bg-rose-950/60 dark:text-rose-200">
            <b>Out of service.</b> {inst.outOfServiceReason || 'No reason given.'}
          </div>
        )}
      </div>

      {/* Actions */}
      {!big && (
        <div className="mt-4 flex flex-wrap gap-2">
          {mine ? (
            <>
              <button onClick={() => onFinish?.(s)} className="flex-1 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-500">
                ✓ Finish
              </button>
              <button onClick={() => onExtend?.(s)} className="flex-1 rounded-xl bg-white px-3 py-2 text-sm font-bold text-slate-800 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700">
                +1h Extend
              </button>
            </>
          ) : (
            (d.kind === 'free' || (d.kind === 'booked' && (!d.currentBooking || d.currentBooking.userId === myUid))) && (
              <Link to={`/start?instrument=${inst.id}`} className="flex-1 rounded-xl bg-indigo-600 px-3 py-2 text-center text-sm font-bold text-white hover:bg-indigo-500">
                <Icon name="play" className="mr-1 inline h-4 w-4" /> Start
              </Link>
            )
          )}
          {d.kind !== 'oos' && (
            <Link to={`/bookings?instrument=${inst.id}`} className="rounded-xl px-3 py-2 text-center text-sm font-semibold text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800">
              <Icon name="calendar" className="mr-1 inline h-4 w-4" /> Book
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
