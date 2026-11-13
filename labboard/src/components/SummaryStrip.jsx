import { STATUS } from '../lib/status';
import { Icon, cx } from './ui';

const ORDER = ['free', 'busy', 'booked', 'oos'];
const ICON = { free: 'check', busy: 'play', booked: 'calendar', oos: 'warning' };
const TINT = { free: 'from-emerald-400 to-emerald-500', busy: 'from-sky-400 to-indigo-500', booked: 'from-violet-400 to-violet-500', oos: 'from-rose-400 to-rose-500' };

/** Four widget-style tiles (macOS Sonoma widgets). Tapping one filters the board. */
export function SummaryStrip({ counts, active, onSelect, big }) {
  if (big) return <BigStrip counts={counts} />;
  // Compact tiles: the numbers are visible at a glance but the instruments still start high up the page.
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
      {ORDER.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onSelect?.(active === k ? null : k)}
          aria-pressed={active === k}
          title={active === k ? 'Show all' : `Show only “${STATUS[k].label}”`}
          className={cx(
            'flex items-center gap-3 rounded-2xl bg-white px-3.5 py-3 text-left shadow-card ring-1 transition active:scale-[0.98] dark:bg-slate-900',
            active === k ? 'ring-2 ring-indigo-500' : 'ring-black/[0.06] hover:shadow-md dark:ring-white/[0.07]',
          )}
        >
          <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-b text-white', TINT[k])}>
            <Icon name={ICON[k]} className="h-4 w-4" strokeWidth={2.4} />
          </span>
          <span className="min-w-0 flex-1 text-sm font-medium leading-tight text-slate-600 dark:text-slate-300">
            {STATUS[k].label}
            {k === 'busy' && counts.overdue ? <span className="block font-semibold text-orange-600">{counts.overdue} overdue</span> : null}
          </span>
          <span className="text-[26px] font-semibold tabular-nums leading-none tracking-tight text-slate-900 dark:text-white">{counts[k] || 0}</span>
        </button>
      ))}
    </div>
  );
}

function BigStrip({ counts }) {
  return (
    <div className="grid grid-cols-4 gap-3">
      {ORDER.map((k) => (
        <div key={k} className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-black/[0.06] dark:bg-slate-900 dark:ring-white/[0.07]">
          <div className="flex items-start justify-between">
            <span className={cx('flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-b text-white', TINT[k])}>
              <Icon name={ICON[k]} className="h-6 w-6" strokeWidth={2.4} />
            </span>
            {k === 'busy' && counts.overdue ? <span className="rounded-full bg-orange-500 px-2 py-0.5 text-xs font-semibold text-white">{counts.overdue} overdue</span> : null}
          </div>
          <div className="mt-3 text-6xl font-semibold tabular-nums tracking-tight text-slate-900 dark:text-white">{counts[k] || 0}</div>
          <div className="mt-1 text-xl font-medium text-slate-500 dark:text-slate-400">{STATUS[k].label}</div>
        </div>
      ))}
    </div>
  );
}
