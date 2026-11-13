import { Icon } from './ui';

/** The bold red "Do not change these" box. */
export function LockedParams({ params, big }) {
  const list = (params || []).filter((p) => p.key || p.value);
  if (!list.length) return null;
  return (
    <div className={`rounded-xl border-2 border-red-600 bg-red-50 dark:border-red-500 dark:bg-red-950/60 ${big ? 'p-4' : 'p-3'}`}>
      <div className={`mb-1.5 flex items-center gap-1.5 font-extrabold uppercase tracking-wide text-red-700 dark:text-red-300 ${big ? 'text-lg' : 'text-xs'}`}>
        <Icon name="lock" className={big ? 'h-5 w-5' : 'h-4 w-4'} /> Do not change these
      </div>
      <dl className={`grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5 ${big ? 'text-lg' : 'text-sm'}`}>
        {list.map((p, i) => (
          <div key={i} className="contents">
            <dt className="font-semibold text-red-900 dark:text-red-200">{p.key}</dt>
            <dd className="font-mono font-bold text-red-800 dark:text-red-100">{p.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
