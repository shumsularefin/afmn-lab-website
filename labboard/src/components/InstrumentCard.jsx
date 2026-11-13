import { Link } from 'react-router-dom';
import { STATUS, AUTO_RELEASE_MIN } from '../lib/status';
import { fmtCountdown, fmtDuration, fmtTime, fmtDateTime, toDate, MIN } from '../lib/time';
import { Avatar, Badge, Icon, cx } from './ui';
import { LockedParams } from './LockedParams';
import { IssueButton } from './IssueButton';
import { LabImage } from './images';

const PILL = 'inline-flex h-9 items-center justify-center gap-1 whitespace-nowrap rounded-full px-3.5 text-sm font-semibold transition active:scale-[0.98]';

export function InstrumentCard({ inst, d, now, myUid, openIssueCount = 0, big = false, showStatus = false, onFinish, onExtend }) {
  const st = STATUS[d.kind];
  const s = d.session;
  const mine = s && s.userId === myUid;
  const remaining = s ? toDate(s.expectedEnd) - now : 0;

  return (
    <div
      className={cx(
        'relative flex min-w-0 flex-col rounded-2xl bg-white shadow-card ring-1 transition hover:shadow-md dark:bg-slate-900 lg:rounded-xl',
        d.kind === 'overdue' ? 'ring-2 ring-orange-500 bg-orange-50/70 dark:bg-orange-500/10' : 'ring-black/[0.06] dark:ring-white/[0.07]',
        big ? 'p-6' : 'p-4',
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={cx('relative shrink-0', big ? 'h-16 w-16' : 'h-11 w-11')}>
          <LabImage
            value={inst.photoURL}
            alt=""
            className="h-full w-full rounded-[10px] ring-1 ring-black/5 dark:ring-white/10"
            fallback={
              <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-gradient-to-br from-slate-100 to-slate-200 text-slate-500 dark:from-white/10 dark:to-white/[0.03] dark:text-slate-400">
                <Icon name="grid" className="h-5 w-5" />
              </div>
            }
          />
          <span className={cx('absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full ring-[2.5px] ring-white dark:ring-slate-900', st.dot, (d.kind === 'busy' || d.kind === 'overdue') && 'animate-pulse')} />
        </div>
        <div className="min-w-0 flex-1">
          <Link to={`/instrument/${inst.id}`} className={cx('line-clamp-2 font-semibold leading-snug text-slate-900 hover:text-indigo-600 dark:text-white', big ? 'text-2xl' : 'text-base')}>
            {inst.name}
          </Link>
          <div className={cx('text-slate-500 dark:text-slate-400', big ? 'text-base' : 'text-sm')}>
            {[inst.type, inst.room].filter(Boolean).join(' · ')}
            {inst.restricted && <span title="Training required"> · 🎓</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {openIssueCount > 0 && <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">⚠ {openIssueCount}</Badge>}
          {(big || showStatus) && <Badge className={st.chip}>{d.kind === 'booked' ? 'Booked' : st.label}</Badge>}
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
              <div className="rounded-lg bg-orange-100 px-3 py-2 text-sm font-medium text-orange-900 dark:bg-orange-500/15 dark:text-orange-200">
                ⏰ Past expected end by {fmtDuration(-remaining)} — {mine ? 'please confirm or finish.' : `${s.userName.split(' ')[0]} has been asked to confirm.`}
              </div>
            )}
            <LockedParams params={s.params} big={big} />
            {s.comments && <p className="whitespace-pre-line rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:bg-white/[0.05] dark:text-slate-200">💬 {s.comments}</p>}
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
          <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:bg-rose-500/10 dark:text-rose-200">
            <b>Out of service.</b> {inst.outOfServiceReason || 'No reason given.'}
          </div>
        )}
      </div>

      {/* Actions */}
      {!big && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-black/[0.05] pt-3 dark:border-white/[0.06]">
          {mine ? (
            <>
              <button onClick={() => onFinish?.(s)} className={cx(PILL, 'flex-1 bg-gradient-to-b from-emerald-400 to-emerald-500 text-white shadow-[inset_0_0.5px_0_rgba(255,255,255,.3)]')}>
                ✓ Finish
              </button>
              <button onClick={() => onExtend?.(s)} title="Extend by 1 hour" className={cx(PILL, 'flex-1 bg-white text-slate-900 shadow-control hover:bg-slate-50 dark:bg-white/[0.12] dark:text-white')}>
                +1 h
              </button>
            </>
          ) : (
            (d.kind === 'free' || (d.kind === 'booked' && (!d.currentBooking || d.currentBooking.userId === myUid))) && (
              <Link to={`/start?instrument=${inst.id}`} className={cx(PILL, 'flex-1 bg-gradient-to-b from-indigo-500 to-indigo-600 text-white shadow-[inset_0_0.5px_0_rgba(255,255,255,.35)] hover:from-indigo-400')}>
                <Icon name="play" className="h-4 w-4" strokeWidth={2.2} /> Start
              </Link>
            )
          )}
          {d.kind !== 'oos' && (
            <Link to={`/bookings?instrument=${inst.id}`} className={cx(PILL, 'bg-slate-100 text-indigo-600 hover:bg-slate-200/70 dark:bg-white/[0.08] dark:text-indigo-400 dark:hover:bg-white/[0.12]')}>
              <Icon name="calendar" className="h-4 w-4" strokeWidth={2} /> Book
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
