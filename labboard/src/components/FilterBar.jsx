import { useEffect, useRef } from 'react';
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
  const search = useRef(null);
  useEffect(() => {
    // Press "/" anywhere on the board to jump to the search box.
    const onKey = (e) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
      e.preventDefault();
      search.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const any = filters.q || filters.type || filters.room || filters.free2h;
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative min-w-0 flex-1">
        <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <Input
          type="search"
          placeholder="Search instrument, person, sample…"
          value={filters.q}
          onChange={(e) => set({ q: e.target.value })}
          className="!pl-9"
          ref={search}
          title="Shortcut: press /"
        />
      </div>
      {/* Phones: one row that scrolls sideways, like iOS filter chips */}
      <div className="-mx-4 flex shrink-0 items-center gap-2 overflow-x-auto px-4 pb-0.5 sm:mx-0 sm:px-0 sm:pb-0">
        <Select value={filters.type} onChange={(e) => set({ type: e.target.value })} className="w-auto shrink-0" aria-label="Instrument type">
          <option value="">All types</option>
          {types.map((t) => <option key={t}>{t}</option>)}
        </Select>
        <Select value={filters.room} onChange={(e) => set({ room: e.target.value })} className="w-auto shrink-0" aria-label="Room">
          <option value="">All rooms</option>
          {rooms.map((r) => <option key={r}>{r}</option>)}
        </Select>
        <button
          type="button"
          aria-pressed={filters.free2h}
          onClick={() => set({ free2h: !filters.free2h })}
          className={cx(
            'h-[42px] shrink-0 whitespace-nowrap rounded-full px-4 text-[15px] font-medium transition',
            filters.free2h ? 'bg-emerald-500 text-white shadow-sm' : 'bg-white text-slate-700 shadow-control dark:bg-white/[0.08] dark:text-slate-200',
          )}
        >
          {filters.free2h && '✓ '}Free ≥ 2 h
        </button>
        {any && (
          <button type="button" onClick={() => onChange({ q: '', type: '', room: '', free2h: false })} className="shrink-0 px-2 text-[15px] font-medium text-indigo-600 lg:text-[15px] dark:text-indigo-400">
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
