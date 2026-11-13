import { Icon, Input, Select, cx } from './ui';

export const EMPTY_FILTERS = { q: '', type: '', room: '', free2h: false };

export function applyFilters(items, filters) {
  const q = filters.q.trim().toLowerCase();
  return items.filter(({ inst, d }) => {
    if (filters.type && inst.type !== filters.type) return false;
    if (filters.room && inst.room !== filters.room) return false;
    if (filters.free2h && !(d.freeAheadMs >= 2 * 3600e3)) return false;
    if (q) {
      const hay = [inst.name, inst.type, inst.room, inst.location, d.session?.userName, d.session?.sample, d.nextBooking?.userName]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function FilterBar({ instruments, filters, onChange }) {
  const types = [...new Set(instruments.map((i) => i.type).filter(Boolean))].sort();
  const rooms = [...new Set(instruments.map((i) => i.room).filter(Boolean))].sort();
  const set = (patch) => onChange({ ...filters, ...patch });
  const any = filters.q || filters.type || filters.room || filters.free2h;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[12rem] flex-1">
        <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          type="search"
          placeholder="Search instrument, person, sample…"
          value={filters.q}
          onChange={(e) => set({ q: e.target.value })}
          className="pl-9"
        />
      </div>
      <Select value={filters.type} onChange={(e) => set({ type: e.target.value })} className="w-auto" aria-label="Instrument type">
        <option value="">All types</option>
        {types.map((t) => <option key={t}>{t}</option>)}
      </Select>
      <Select value={filters.room} onChange={(e) => set({ room: e.target.value })} className="w-auto" aria-label="Room">
        <option value="">All rooms</option>
        {rooms.map((r) => <option key={r}>{r}</option>)}
      </Select>
      <button
        type="button"
        onClick={() => set({ free2h: !filters.free2h })}
        className={cx(
          'rounded-xl px-3 py-2.5 text-sm font-semibold ring-1 ring-inset transition',
          filters.free2h ? 'bg-emerald-600 text-white ring-emerald-600' : 'bg-white text-slate-700 ring-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700',
        )}
      >
        Free ≥ 2 h
      </button>
      {any && (
        <button type="button" onClick={() => onChange({ q: '', type: '', room: '', free2h: false })} className="px-2 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">
          Clear
        </button>
      )}
    </div>
  );
}
