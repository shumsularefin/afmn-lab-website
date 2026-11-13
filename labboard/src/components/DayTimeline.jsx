import { Link } from 'react-router-dom';
import { toDate, startOfDay, fmtTime, HOUR } from '../lib/time';
import { bookingIsLive } from '../lib/status';
import { cx } from './ui';

const HOURS = Array.from({ length: 25 }, (_, i) => i);

/**
 * One row per instrument, colored blocks across a day.
 * Sources: active sessions (blue / orange if overdue), finished sessions of the
 * day (grey), bookings (violet), out-of-service (red band).
 */
export function DayTimeline({ instruments, day, bookings, activeSessions, daySessions = [], now, big, myUid }) {
  const dayStart = startOfDay(day).getTime();
  const dayEnd = dayStart + 24 * HOUR;
  const pct = (t) => Math.max(0, Math.min(100, ((toDate(t).getTime() - dayStart) / (24 * HOUR)) * 100));
  const nowPct = now >= dayStart && now < dayEnd ? pct(now) : null;

  function blocksFor(inst) {
    const out = [];
    if (inst.status === 'out_of_service') {
      out.push({ key: 'oos', start: dayStart, end: dayEnd, cls: 'bg-rose-200/70 dark:bg-rose-900/50 text-rose-800 dark:text-rose-200', label: 'Out of service' });
    }
    for (const s of daySessions) {
      if (s.instrumentId !== inst.id || s.status !== 'finished') continue;
      out.push({ key: s.id, start: s.startedAt, end: s.endedAt || s.expectedEnd, cls: 'bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-200', label: `${s.userName} (done)` });
    }
    for (const s of activeSessions) {
      if (s.instrumentId !== inst.id) continue;
      const overdue = toDate(s.expectedEnd) < now;
      out.push({
        key: s.id,
        start: s.startedAt || now,
        end: overdue ? now : s.expectedEnd,
        cls: overdue ? 'bg-orange-500 text-white' : 'bg-sky-500 text-white',
        label: `${s.userName}${s.sample ? ' · ' + s.sample : ''}`,
        mine: s.userId === myUid,
      });
    }
    for (const b of bookings) {
      if (b.instrumentId !== inst.id || b.status !== 'booked' || !bookingIsLive(b, now)) continue;
      out.push({ key: b.id, start: b.start, end: b.end, cls: 'bg-violet-500/90 text-white', label: `${b.userName} (booked)`, mine: b.userId === myUid });
    }
    return out.filter((b) => toDate(b.end).getTime() > dayStart && toDate(b.start).getTime() < dayEnd);
  }

  return (
    <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
      <div className="min-w-[56rem]">
        {/* hour header */}
        <div className="flex border-b border-slate-200 dark:border-slate-800">
          <div className={cx('shrink-0 px-3 py-2 text-xs font-semibold text-slate-500', big ? 'w-72' : 'w-48')}>Instrument</div>
          <div className="relative h-8 flex-1">
            {HOURS.filter((h) => h % 2 === 0 && h < 24).map((h) => (
              <span key={h} className={cx('absolute top-2 -translate-x-1/2 text-slate-400', big ? 'text-sm' : 'text-[10px]')} style={{ left: `${(h / 24) * 100}%` }}>
                {String(h).padStart(2, '0')}:00
              </span>
            ))}
          </div>
        </div>
        {instruments.map((inst) => (
          <div key={inst.id} className="flex border-b border-slate-100 last:border-0 dark:border-slate-800">
            <Link to={`/instrument/${inst.id}`} className={cx('shrink-0 truncate px-3 py-3 font-medium text-slate-800 hover:text-indigo-600 dark:text-slate-200', big ? 'w-72 text-lg' : 'w-48 text-sm')}>
              {inst.name}
              <span className="block text-xs font-normal text-slate-400">{inst.room}</span>
            </Link>
            <div className={cx('relative flex-1', big ? 'h-16' : 'h-12')}>
              {HOURS.map((h) => (
                <div key={h} className={cx('absolute inset-y-0 border-l', h % 6 === 0 ? 'border-slate-200 dark:border-slate-700' : 'border-slate-100 dark:border-slate-800/60')} style={{ left: `${(h / 24) * 100}%` }} />
              ))}
              {blocksFor(inst).map((b) => {
                const left = pct(b.start);
                const width = Math.max(0.6, pct(b.end) - left);
                return (
                  <div
                    key={b.key}
                    title={`${b.label}\n${fmtTime(b.start)} – ${fmtTime(b.end)}`}
                    className={cx('absolute top-1.5 bottom-1.5 overflow-hidden truncate rounded-md px-1.5 py-1 font-semibold shadow-sm', b.cls, big ? 'text-sm' : 'text-[11px]', b.mine && 'ring-2 ring-indigo-300 ring-offset-1 dark:ring-offset-slate-900')}
                    style={{ left: `${left}%`, width: `${width}%` }}
                  >
                    {b.label}
                  </div>
                );
              })}
              {nowPct != null && <div className="absolute inset-y-0 w-0.5 bg-rose-500" style={{ left: `${nowPct}%` }} />}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-4 border-t border-slate-200 px-3 py-2 text-xs text-slate-500 dark:border-slate-800">
        <Legend cls="bg-sky-500" label="In use" />
        <Legend cls="bg-orange-500" label="Overdue" />
        <Legend cls="bg-violet-500" label="Booked" />
        <Legend cls="bg-slate-300 dark:bg-slate-700" label="Finished" />
        <Legend cls="bg-rose-300" label="Out of service" />
        <Legend cls="bg-rose-500 w-0.5" label="Now" />
      </div>
    </div>
  );
}

function Legend({ cls, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cx('inline-block h-3 w-3 rounded-sm', cls)} /> {label}
    </span>
  );
}
