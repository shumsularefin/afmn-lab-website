import { HOUR, nextMorning, toLocalInput, fromLocalInput, fmtDateTime } from '../lib/time';
import { cx, Input } from './ui';

const QUICK = [
  { label: '+30m', ms: HOUR / 2 },
  { label: '+1h', ms: HOUR },
  { label: '+2h', ms: 2 * HOUR },
  { label: '+3h', ms: 3 * HOUR },
  { label: '+6h', ms: 6 * HOUR },
  { label: '+12h', ms: 12 * HOUR },
];

/** Quick end-time buttons + exact picker. `base` = time the offsets add to. */
export function EndTimePicker({ value, onChange, base = new Date() }) {
  const pick = (d) => onChange(new Date(Math.round(d.getTime() / (5 * 60e3)) * 5 * 60e3));
  return (
    <div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
        {QUICK.map((q) => {
          const target = new Date(base.getTime() + q.ms);
          const active = value && Math.abs(value - target) < 5 * 60e3;
          return (
            <button
              key={q.label}
              type="button"
              onClick={() => pick(target)}
              className={cx(
                'rounded-xl py-3 text-sm font-bold ring-1 ring-inset transition',
                active ? 'bg-indigo-600 text-white ring-indigo-600' : 'bg-white text-slate-800 ring-slate-300 hover:bg-indigo-50 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700',
              )}
            >
              {q.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onChange(nextMorning(base))}
          className={cx(
            'col-span-2 rounded-xl py-3 text-sm font-bold ring-1 ring-inset transition sm:col-span-1',
            value && +value === +nextMorning(base) ? 'bg-indigo-600 text-white ring-indigo-600' : 'bg-white text-slate-800 ring-slate-300 hover:bg-indigo-50 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700',
          )}
        >
          🌙 Overnight
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Input type="datetime-local" value={toLocalInput(value)} onChange={(e) => onChange(fromLocalInput(e.target.value))} className="max-w-xs" />
        {value && <span className="text-sm text-slate-500">ends {fmtDateTime(value)}</span>}
      </div>
    </div>
  );
}
