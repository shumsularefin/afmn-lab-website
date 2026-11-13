import { STATUS } from '../lib/status';
import { cx } from './ui';

const ORDER = ['free', 'busy', 'booked', 'oos'];

export function SummaryStrip({ counts, active, onSelect, big }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {ORDER.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onSelect?.(active === k ? null : k)}
          className={cx(
            'flex items-center gap-3 rounded-2xl bg-white p-4 text-left shadow-sm ring-1 transition dark:bg-slate-900',
            active === k ? 'ring-2 ring-indigo-500' : 'ring-slate-200 hover:ring-slate-300 dark:ring-slate-800',
          )}
        >
          <span className={cx('h-3 w-3 shrink-0 rounded-full', STATUS[k].dot)} />
          <span className="min-w-0">
            <span className={cx('block font-extrabold text-slate-900 dark:text-white', big ? 'text-5xl' : 'text-3xl')}>{counts[k] || 0}</span>
            <span className={cx('block font-medium text-slate-500 dark:text-slate-400', big ? 'text-lg' : 'text-xs sm:text-sm')}>
              {STATUS[k].label}
              {k === 'busy' && counts.overdue ? <span className="ml-1 font-bold text-orange-600">({counts.overdue} overdue)</span> : null}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
