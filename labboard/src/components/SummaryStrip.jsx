import { STATUS } from '../lib/status';
import { Icon, cx } from './ui';

const ORDER = ['free', 'busy', 'booked', 'oos'];
const ICON = { free: 'check', busy: 'play', booked: 'calendar', oos: 'warning' };
const TINT = { free: 'from-emerald-400 to-emerald-500', busy: 'from-sky-400 to-indigo-500', booked: 'from-violet-400 to-violet-500', oos: 'from-rose-400 to-rose-500' };

/** Four widget-style tiles (macOS Sonoma widgets). Tapping one filters the board. */
export function SummaryStrip({ counts, active, onSelect, big }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {ORDER.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onSelect?.(active === k ? null : k)}
          aria-pressed={active === k}
          className={cx(
            'group relative overflow-hidden rounded-2xl bg-white p-3.5 text-left sm:p-4 shadow-card ring-1 transition active:scale-[0.98] dark:bg-slate-900',
            active === k ? 'ring-2 ring-indigo-500' : 'ring-black/[0.06] hover:shadow-md dark:ring-white/[0.07]',
          )}
        >
          <div className="flex items-start justify-between">
            <span className={cx('flex items-center justify-center rounded-full bg-gradient-to-b text-white shadow-sm', TINT[k], big ? 'h-12 w-12' : 'h-7 w-7 sm:h-8 sm:w-8')}>
              <Icon name={ICON[k]} className={big ? 'h-6 w-6' : 'h-4 w-4'} strokeWidth={2.4} />
            </span>
            {k === 'busy' && counts.overdue && big ? <span className="rounded-full bg-orange-500 px-2 py-0.5 text-[11px] font-semibold text-white">{counts.overdue} overdue</span> : null}
          </div>
          <div className={cx('font-semibold tabular-nums tracking-tight text-slate-900 dark:text-white', big ? 'mt-3 text-6xl' : 'absolute right-3.5 top-3 text-[28px] leading-none sm:static sm:mt-3 sm:text-[34px]')}>{counts[k] || 0}</div>
          <div className={cx('font-medium text-slate-500 dark:text-slate-400', big ? 'mt-1 text-xl' : 'mt-2.5 text-[13px] sm:mt-1')}>{STATUS[k].label}{k === 'busy' && counts.overdue && !big ? <span className="ml-1 font-semibold text-orange-500">· {counts.overdue} overdue</span> : null}</div>
        </button>
      ))}
    </div>
  );
}
