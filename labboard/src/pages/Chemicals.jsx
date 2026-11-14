import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useToast } from '../contexts/ToastContext';
import { useLiveQuery } from '../hooks/useQuery';
import { downloadCSV } from '../lib/csv';
import { fmtDate, fmtDateTime, toDate, toDateInput } from '../lib/time';
import {
  CATEGORIES, CHEM_STATUS, CSV_COLUMNS, HAZARD, HAZARDS, STORAGE, UNITS, cancelReorder, casValid, chemMatches, chemStatus,
  chemicalsFromCSV, convert, createChemical, deleteChemical, fillLevel, fmtQty, importChemicals, requestReorder, restockChemical,
  round, setStock, unitsLike, updateChemical, recordUse,
} from '../lib/chemicals';
import { Badge, Button, Card, EmptyState, Field, Icon, Input, Modal, PageHeader, Segmented, Select, Spinner, Textarea, cx } from '../components/ui';
import { ImageField, LabImage } from '../components/images';

// ── Small pieces ─────────────────────────────────────────────────────────────

function HazardChips({ hazards = [], size = 'sm' }) {
  if (!hazards.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {hazards.map((h) =>
        HAZARD[h] ? (
          <span
            key={h}
            title={`${HAZARD[h].label} (${HAZARD[h].code})`}
            className={cx(
              'inline-flex items-center gap-1 rounded-md border border-rose-500/60 bg-white font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
              size === 'sm' ? 'px-1.5 text-xs leading-5' : 'px-2 py-0.5 text-sm',
            )}
          >
            <span aria-hidden="true">{HAZARD[h].symbol}</span>
            {size !== 'sm' && HAZARD[h].label}
          </span>
        ) : null,
      )}
    </span>
  );
}

function StatusChip({ kind }) {
  const s = CHEM_STATUS[kind];
  return <Badge className={s.chip}>{s.label}</Badge>;
}

function StockBar({ c, className }) {
  const st = chemStatus(c);
  return (
    <div className={cx('h-1.5 overflow-hidden rounded-full bg-black/[0.07] dark:bg-white/10', className)}>
      <div className={cx('h-full rounded-full transition-all', CHEM_STATUS[st.kind].bar)} style={{ width: `${Math.max(st.kind === 'out' ? 0 : 3, fillLevel(c) * 100)}%` }} />
    </div>
  );
}

function expiryText(c) {
  const { days } = chemStatus(c);
  if (days == null) return null;
  if (days < 0) return `Expired ${fmtDate(c.expiry)}`;
  if (days < 1) return 'Expires today';
  return days <= 60 ? `Expires in ${Math.ceil(days)} d` : `Expires ${fmtDate(c.expiry)}`;
}

function Info({ label, children }) {
  if (!children) return null;
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-[15px] text-slate-900 dark:text-slate-100">{children}</dd>
    </div>
  );
}

const LOG_TYPE = {
  use: { label: 'Used', chip: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300', sign: '−' },
  restock: { label: 'Restocked', chip: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', sign: '+' },
  adjust: { label: 'Stocktake', chip: 'bg-amber-500/15 text-amber-800 dark:text-amber-200', sign: '' },
  create: { label: 'Added', chip: 'bg-slate-500/10 text-slate-700 dark:text-slate-300', sign: '+' },
};

function LogRow({ l, showChemical }) {
  const t = LOG_TYPE[l.type] || LOG_TYPE.adjust;
  return (
    <div className="flex items-start gap-3 px-4 py-2.5">
      <Badge className={cx('mt-0.5 w-[78px] justify-center', t.chip)}>{t.label}</Badge>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] text-slate-900 dark:text-slate-100">
          <span className="font-semibold tabular-nums">
            {l.type === 'adjust' ? `${fmtQty(l.before, l.unit)} → ${fmtQty(l.after, l.unit)}` : `${t.sign}${fmtQty(l.amount, l.unit)}`}
          </span>
          {showChemical && <span> · {l.chemicalName}</span>}
          {l.note && <span className="text-slate-500"> · {l.note}</span>}
        </div>
        <div className="text-sm text-slate-500">
          {l.userName} · {fmtDateTime(l.createdAt)}
          {l.type !== 'adjust' && <> · {fmtQty(l.after, l.unit)} left</>}
          {l.lotNo && <> · lot {l.lotNo}</>}
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Chemicals() {
  const { isAdmin, isMember } = useAuth();
  const { reorders } = useData();
  const all = useLiveQuery(() => collection(db, 'chemicals'), []);
  const [tab, setTab] = useState('inventory');
  const [openId, setOpenId] = useState(null);
  const [action, setAction] = useState(null); // { type: 'use'|'restock'|'stock'|'reorder'|'edit'|'import', chemical? }

  const chemicals = useMemo(() => [...all.data].sort((a, b) => a.name.localeCompare(b.name)), [all.data]);
  const open = chemicals.find((c) => c.id === openId);
  const act = (type, chemical) => setAction({ type, chemical });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Chemicals"
        subtitle="What's on the shelf, how much is left and where it lives. Log what you use so the stock stays right."
        actions={
          <>
            <Button variant="secondary" size="sm" disabled={!chemicals.length} onClick={() => downloadCSV('labboard-chemicals.csv', chemicals, CSV_COLUMNS)}>
              <Icon name="download" className="h-4 w-4" /> Export
            </Button>
            {isAdmin && (
              <>
                <Button variant="secondary" size="sm" className="hidden sm:inline-flex" onClick={() => act('import')}>
                  <Icon name="upload" className="h-4 w-4" /> Import CSV
                </Button>
                <Button size="sm" onClick={() => act('edit')}>
                  <Icon name="plus" className="h-4 w-4" strokeWidth={2.2} /> Add chemical
                </Button>
              </>
            )}
          </>
        }
      />

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'inventory', label: 'Inventory' },
          { value: 'log', label: 'Usage log' },
          { value: 'requests', label: 'Reorder requests', count: reorders.length },
        ]}
      />

      {all.error ? (
        <EmptyState icon="warning" title="Could not load the inventory">{all.error.message}</EmptyState>
      ) : all.loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : tab === 'inventory' ? (
        <Inventory chemicals={chemicals} onOpen={setOpenId} onUse={(c) => act('use', c)} onAdd={() => act('edit')} />
      ) : tab === 'log' ? (
        <UsageLog />
      ) : (
        <Requests chemicals={chemicals} onOpen={setOpenId} act={act} />
      )}

      {open && !action && (
        <ChemicalDetail c={open} onClose={() => setOpenId(null)} act={act} isAdmin={isAdmin} isMember={isMember} />
      )}
      {action?.type === 'use' && <UseModal c={chemicals.find((c) => c.id === action.chemical.id) || action.chemical} onClose={() => setAction(null)} />}
      {action?.type === 'restock' && <RestockModal c={action.chemical} onClose={() => setAction(null)} />}
      {action?.type === 'stock' && <StocktakeModal c={action.chemical} onClose={() => setAction(null)} />}
      {action?.type === 'reorder' && <ReorderModal c={action.chemical} onClose={() => setAction(null)} />}
      {action?.type === 'edit' && (
        <ChemicalForm
          c={action.chemical}
          chemicals={chemicals}
          onClose={() => setAction(null)}
          onDeleted={() => (setAction(null), setOpenId(null))}
          onSaved={(id) => (setAction(null), setOpenId(id))}
        />
      )}
      {action?.type === 'import' && <ImportModal onClose={() => setAction(null)} />}
    </div>
  );
}

// ── Inventory list ───────────────────────────────────────────────────────────

const loadFilters = () => {
  try {
    return JSON.parse(localStorage.getItem('lb-chem-filters')) || {};
  } catch {
    return {};
  }
};

function Inventory({ chemicals, onOpen, onUse, onAdd }) {
  const { isMember, isAdmin } = useAuth();
  const saved = useRef(loadFilters()).current;
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [category, setCategory] = useState(saved.category || '');
  const [location, setLocation] = useState(saved.location || '');
  const [hazard, setHazard] = useState('');
  const [sort, setSort] = useState(saved.sort || 'name');
  const search = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem('lb-chem-filters', JSON.stringify({ category, location, sort }));
    } catch { /* private mode */ }
  }, [category, location, sort]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement?.tagName)) {
        e.preventDefault();
        search.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const withStatus = useMemo(() => chemicals.map((c) => ({ c, st: chemStatus(c) })), [chemicals]);
  const counts = useMemo(() => {
    const n = { all: withStatus.length, ok: 0, low: 0, out: 0, expiry: 0 };
    for (const { st } of withStatus) {
      if (st.flags.includes('out')) n.out++;
      else if (st.flags.includes('low')) n.low++;
      else n.ok++;
      if (st.flags.includes('expired') || st.flags.includes('expiring')) n.expiry++;
    }
    return n;
  }, [withStatus]);
  const locations = useMemo(() => [...new Set(chemicals.map((c) => c.location).filter(Boolean))].sort(), [chemicals]);
  const categories = useMemo(() => [...new Set(chemicals.map((c) => c.category).filter(Boolean))].sort(), [chemicals]);

  const rows = withStatus
    .filter(({ c, st }) => {
      if (status === 'ok' && (st.flags.includes('out') || st.flags.includes('low'))) return false;
      if (status === 'low' && !st.flags.includes('low')) return false;
      if (status === 'out' && !st.flags.includes('out')) return false;
      if (status === 'expiry' && !st.flags.some((f) => f === 'expired' || f === 'expiring')) return false;
      if (category && c.category !== category) return false;
      if (location && c.location !== location) return false;
      if (hazard && !(c.hazards || []).includes(hazard)) return false;
      return chemMatches(c, q);
    })
    .sort((a, b) => {
      if (sort === 'stock') return fillLevel(a.c) - fillLevel(b.c) || a.c.name.localeCompare(b.c.name);
      if (sort === 'expiry') return (toDate(a.c.expiry)?.getTime() ?? Infinity) - (toDate(b.c.expiry)?.getTime() ?? Infinity);
      if (sort === 'location') return (a.c.location || '~').localeCompare(b.c.location || '~') || a.c.name.localeCompare(b.c.name);
      if (sort === 'updated') return (toDate(b.c.updatedAt) || 0) - (toDate(a.c.updatedAt) || 0);
      return a.c.name.localeCompare(b.c.name);
    });

  if (!chemicals.length) {
    return (
      <EmptyState icon="flask" title="No chemicals yet">
        {isAdmin ? (
          <>
            Add chemicals one by one or import a spreadsheet.
            <div className="mt-4">
              <Button onClick={onAdd}><Icon name="plus" className="h-4 w-4" /> Add chemical</Button>
            </div>
          </>
        ) : (
          'An admin has not added the inventory yet.'
        )}
      </EmptyState>
    );
  }

  const TILES = [
    { value: 'all', label: 'All chemicals', short: 'All', n: counts.all, icon: 'flask', tint: 'text-indigo-600 bg-indigo-500/10' },
    { value: 'ok', label: 'In stock', short: 'In stock', n: counts.ok, icon: 'check', tint: 'text-emerald-600 bg-emerald-500/10' },
    { value: 'low', label: 'Low stock', short: 'Low', n: counts.low, icon: 'warning', tint: 'text-orange-600 bg-orange-500/10' },
    { value: 'out', label: 'Out of stock', short: 'Out', n: counts.out, icon: 'x', tint: 'text-rose-600 bg-rose-500/10' },
    { value: 'expiry', label: 'Expiring / expired', short: 'Expiring', n: counts.expiry, icon: 'clock', tint: 'text-amber-600 bg-amber-500/15' },
  ];
  const filtered = q || status !== 'all' || category || location || hazard;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-5 gap-1.5 sm:gap-2 lg:grid-cols-5">
        {TILES.map((t) => (
          <button
            key={t.value}
            onClick={() => setStatus(status === t.value && t.value !== 'all' ? 'all' : t.value)}
            className={cx(
              'flex min-w-0 flex-col items-center gap-0 rounded-xl bg-white px-1 py-2 text-center shadow-card ring-1 transition dark:bg-slate-900 lg:flex-row lg:gap-3 lg:p-3 lg:text-left',
              status === t.value ? 'ring-2 ring-indigo-500' : 'ring-black/[0.06] hover:ring-black/[0.15] dark:ring-white/[0.07]',
            )}
          >
            <span className={cx('hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg lg:flex', t.tint)}>
              <Icon name={t.icon} className="h-5 w-5" strokeWidth={2} />
            </span>
            <span className="w-full min-w-0 lg:w-auto">
              <span className="block text-xl font-bold tabular-nums leading-tight text-slate-900 dark:text-white">{t.n}</span>
              <span className="block truncate text-xs text-slate-500 lg:hidden">{t.short}</span>
              <span className="hidden truncate text-sm text-slate-500 lg:block">{t.label}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-[2]">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input ref={search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, formula, CAS, shelf…" className="!pl-9" type="search" />
        </div>
        <Select value={category} onChange={(e) => setCategory(e.target.value)} className="min-w-[140px] flex-1" aria-label="Category">
          <option value="">All categories</option>
          {categories.map((c) => <option key={c}>{c}</option>)}
        </Select>
        <Select value={location} onChange={(e) => setLocation(e.target.value)} className="min-w-[140px] flex-1" aria-label="Location">
          <option value="">All locations</option>
          {locations.map((c) => <option key={c}>{c}</option>)}
        </Select>
        <Select value={hazard} onChange={(e) => setHazard(e.target.value)} className="min-w-[140px] flex-1" aria-label="Hazard">
          <option value="">Any hazard</option>
          {HAZARDS.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
        </Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value)} className="min-w-[140px] flex-1" aria-label="Sort">
          <option value="name">Sort: Name</option>
          <option value="stock">Sort: Lowest stock</option>
          <option value="expiry">Sort: Expiry date</option>
          <option value="location">Sort: Location</option>
          <option value="updated">Sort: Recently changed</option>
        </Select>
      </div>

      {filtered && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          {rows.length} of {chemicals.length} shown
          <button className="font-medium text-indigo-600 hover:underline dark:text-indigo-400" onClick={() => (setQ(''), setStatus('all'), setCategory(''), setLocation(''), setHazard(''))}>
            Clear filters
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState icon="search" title="Nothing matches">Try another search or clear the filters.</EmptyState>
      ) : (
        <div className="divide-y divide-black/[0.06] overflow-hidden rounded-xl bg-white shadow-card ring-1 ring-black/[0.06] dark:divide-white/[0.06] dark:bg-slate-900 dark:ring-white/[0.07]">
          {rows.map(({ c, st }) => (
            <div
              key={c.id}
              role="button"
              tabIndex={0}
              onClick={() => onOpen(c.id)}
              onKeyDown={(e) => e.key === 'Enter' && onOpen(c.id)}
              className="flex cursor-pointer items-center gap-3 px-3 py-3 transition hover:bg-slate-50 focus:bg-slate-50 focus:outline-none dark:hover:bg-white/[0.03] dark:focus:bg-white/[0.03] sm:px-4"
            >
              <div className="hidden h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-slate-100 dark:bg-white/[0.06] sm:block">
                <LabImage value={c.photo} className="h-full w-full object-cover" fallback={<div className="flex h-full w-full items-center justify-center"><Icon name="flask" className="h-5 w-5 text-slate-400" /></div>} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="truncate text-[15px] font-semibold text-slate-900 dark:text-white">{c.name}</span>
                  {c.formula && <span className="text-sm text-slate-500">{c.formula}</span>}
                  <HazardChips hazards={c.hazards} />
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-sm text-slate-500">
                  {c.location && <span className="inline-flex items-center gap-1"><Icon name="map" className="h-3.5 w-3.5" />{c.location}</span>}
                  {c.cas && <span>CAS {c.cas}</span>}
                  {expiryText(c) && <span className={st.flags.includes('expired') ? 'font-medium text-rose-600' : st.flags.includes('expiring') ? 'font-medium text-amber-600' : ''}>{expiryText(c)}</span>}
                  {c.reorder && <span className="font-medium text-violet-600 dark:text-violet-400">Reorder requested</span>}
                </div>
              </div>
              <div className="w-28 shrink-0 text-right sm:w-40">
                <div className="text-[15px] font-semibold tabular-nums text-slate-900 dark:text-white">{fmtQty(c.quantity, c.unit)}</div>
                <StockBar c={c} className="mt-1" />
                <div className={cx('mt-1 text-xs font-medium', st.kind === 'ok' ? 'text-slate-500' : st.kind === 'low' ? 'text-orange-600' : st.kind === 'expiring' ? 'text-amber-600' : 'text-rose-600')}>
                  {CHEM_STATUS[st.kind].label}
                </div>
              </div>
              {isMember && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="shrink-0"
                  disabled={st.flags.includes('out')}
                  onClick={(e) => (e.stopPropagation(), onUse(c))}
                  title={`Record how much ${c.name} you used`}
                >
                  Use
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Detail ───────────────────────────────────────────────────────────────────

function ChemicalDetail({ c, onClose, act, isAdmin, isMember }) {
  const { profile } = useAuth();
  const toast = useToast();
  const logs = useLiveQuery(() => query(collection(db, 'chemicalLogs'), where('chemicalId', '==', c.id), orderBy('createdAt', 'desc'), limit(15)), [c.id]);
  const st = chemStatus(c);
  const mine = c.reorder?.uid === profile?.uid;

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={c.name}
      footer={
        <>
          {isAdmin && (
            <>
              <Button variant="plain" size="sm" onClick={() => act('edit', c)}><Icon name="edit" className="h-4 w-4" /> Edit</Button>
              <Button variant="secondary" size="sm" onClick={() => act('stock', c)}>Stocktake</Button>
              <Button variant="secondary" size="sm" onClick={() => act('restock', c)}><Icon name="plus" className="h-4 w-4" /> Restock</Button>
            </>
          )}
          {isMember && !c.reorder && (
            <Button variant="secondary" size="sm" onClick={() => act('reorder', c)}><Icon name="bell" className="h-4 w-4" /> Request reorder</Button>
          )}
          {isMember && c.reorder && (mine || isAdmin) && (
            <Button variant="secondary" size="sm" onClick={() => cancelReorder(c).then(() => toast.success('Request withdrawn'), toast.error)}>
              {mine ? 'Withdraw request' : 'Dismiss request'}
            </Button>
          )}
          {isMember && (
            <Button size="sm" disabled={st.flags.includes('out')} onClick={() => act('use', c)}>Use some</Button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex gap-4">
          {c.photo && (
            <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-slate-100 dark:bg-white/[0.06]">
              <LabImage value={c.photo} className="h-full w-full object-cover" />
            </div>
          )}
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {c.formula && <span className="text-[15px] text-slate-600 dark:text-slate-300">{c.formula}</span>}
              {st.flags.filter((f) => f !== 'requested').map((f) => <StatusChip key={f} kind={f} />)}
              {st.flags.length === (c.reorder ? 1 : 0) && <StatusChip kind="ok" />}
              {c.reorder && <StatusChip kind="requested" />}
            </div>
            <HazardChips hazards={c.hazards} size="md" />
          </div>
        </div>

        <Card className="p-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-sm text-slate-500">Available now</div>
              <div className="text-3xl font-bold tabular-nums text-slate-900 dark:text-white">{fmtQty(c.quantity, c.unit)}</div>
            </div>
            <div className="text-right text-sm text-slate-500">
              {c.containerSize > 0 && <div>of {fmtQty(c.containerSize, c.unit)} container</div>}
              {c.minQuantity > 0 && <div>Reorder at {fmtQty(c.minQuantity, c.unit)}</div>}
            </div>
          </div>
          <StockBar c={c} className="mt-3 !h-2" />
          {c.reorder && (
            <p className="mt-3 text-sm text-violet-700 dark:text-violet-300">
              Reorder requested by {c.reorder.name} {c.reorder.at && <>on {fmtDate(c.reorder.at)}</>}
              {c.reorder.note && <> — “{c.reorder.note}”</>}
            </p>
          )}
        </Card>

        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Info label="Location">{c.location}</Info>
          <Info label="Storage">{c.storage}</Info>
          <Info label="Category">{c.category}</Info>
          <Info label="CAS number">{c.cas}</Info>
          <Info label="Grade / purity">{c.grade}</Info>
          <Info label="Expiry">{toDate(c.expiry) && <span className={st.flags.includes('expired') ? 'text-rose-600' : st.flags.includes('expiring') ? 'text-amber-600' : ''}>{fmtDate(c.expiry)}</span>}</Info>
          <Info label="Supplier">{c.supplier}</Info>
          <Info label="Catalog no.">{c.catalogNo}</Info>
          <Info label="Lot no.">{c.lotNo}</Info>
        </dl>

        {c.sdsURL && (
          <a href={c.sdsURL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-500/15 dark:text-rose-300">
            <Icon name="book" className="h-4 w-4" /> Safety data sheet (SDS)
          </a>
        )}
        {c.notes && <p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-[15px] text-slate-700 dark:bg-white/[0.04] dark:text-slate-200">{c.notes}</p>}

        <div>
          <div className="mb-1.5 text-sm font-semibold uppercase tracking-wide text-slate-500">Recent activity</div>
          <div className="divide-y divide-black/[0.06] overflow-hidden rounded-xl ring-1 ring-black/[0.06] dark:divide-white/[0.06] dark:ring-white/[0.07]">
            {logs.loading ? (
              <div className="p-4 text-center"><Spinner /></div>
            ) : logs.error ? (
              <p className="p-4 text-sm text-slate-500">Activity needs the new database index — {logs.error.message}</p>
            ) : logs.data.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">No activity recorded yet.</p>
            ) : (
              logs.data.map((l) => <LogRow key={l.id} l={l} />)
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ── Use ──────────────────────────────────────────────────────────────────────

function UseModal({ c, onClose }) {
  const { profile } = useAuth();
  const { activeSessions } = useData();
  const toast = useToast();
  const session = activeSessions.find((s) => s.userId === profile?.uid);
  const units = unitsLike(c.unit);
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState(c.unit);
  const [note, setNote] = useState(session ? [session.instrumentName, session.sample].filter(Boolean).join(' · ') : '');
  const [busy, setBusy] = useState(false);
  const input = useRef(null);
  useEffect(() => input.current?.focus(), []);

  const amt = Number(String(amount).replace(',', '.'));
  const inUnit = amt > 0 ? convert(amt, unit, c.unit) : 0;
  const left = round((c.quantity || 0) - inUnit);
  const tooMuch = left < -1e-9;
  const willBeLow = !tooMuch && c.minQuantity > 0 && left <= c.minQuantity && c.quantity > c.minQuantity;

  async function submit(e) {
    e?.preventDefault();
    if (!(amt > 0) || tooMuch) return;
    setBusy(true);
    try {
      const r = await recordUse({ chemical: c, amount: amt, unit, note, profile });
      toast.success(`Logged · ${fmtQty(r.after, r.unit)} of ${r.name} left`);
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Use ${c.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={!(amt > 0) || tooMuch}>Record use</Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 dark:bg-white/[0.04]">
          <span className="text-sm text-slate-500">In stock</span>
          <span className="text-lg font-semibold tabular-nums">{fmtQty(c.quantity, c.unit)}</span>
        </div>
        <Field label="How much are you using?">
          <div className="flex gap-2">
            <Input ref={input} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="0" className="flex-1 text-lg" aria-label="Amount" />
            {units.length > 1 ? (
              <Select value={unit} onChange={(e) => setUnit(e.target.value)} className="!w-24" aria-label="Unit">
                {units.map((u) => <option key={u.value}>{u.value}</option>)}
              </Select>
            ) : (
              <span className="flex items-center px-2 text-slate-500">{c.unit}</span>
            )}
          </div>
        </Field>
        {amt > 0 && (
          <div className={cx('rounded-xl px-4 py-3 text-[15px]', tooMuch ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300' : willBeLow ? 'bg-orange-500/10 text-orange-800 dark:text-orange-300' : 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300')}>
            {tooMuch ? (
              <>That's more than is in stock ({fmtQty(c.quantity, c.unit)}).</>
            ) : (
              <>
                <b className="tabular-nums">{fmtQty(left, c.unit)}</b> will be left
                {unit !== c.unit && <> (using {fmtQty(inUnit, c.unit)})</>}.
                {willBeLow && ' That is below the reorder level — consider requesting a reorder.'}
                {left <= 0 && ' This finishes the stock.'}
              </>
            )}
          </div>
        )}
        <Field label="What for?" hint="Optional — sample, experiment or instrument. Shown in the usage log.">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. HPLC mobile phase" maxLength={500} />
        </Field>
      </form>
    </Modal>
  );
}

// ── Admin: restock / stocktake ───────────────────────────────────────────────

function RestockModal({ c, onClose }) {
  const { profile } = useAuth();
  const toast = useToast();
  const units = unitsLike(c.unit);
  const [f, setF] = useState({ amount: c.containerSize || '', unit: c.unit, lotNo: '', expiry: '', note: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e?.preventDefault();
    setBusy(true);
    try {
      await restockChemical({ chemical: c, ...f, profile });
      toast.success(`${c.name} restocked`);
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={`Restock ${c.name}`} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy}>Add to stock</Button></>}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-500">Currently {fmtQty(c.quantity, c.unit)}. The amount received is added on top; any open reorder request is closed.</p>
        <Field label="Amount received">
          <div className="flex gap-2">
            <Input autoFocus inputMode="decimal" value={f.amount} onChange={set('amount')} className="flex-1" />
            {units.length > 1 && <Select value={f.unit} onChange={set('unit')} className="!w-24">{units.map((u) => <option key={u.value}>{u.value}</option>)}</Select>}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="New lot no." hint="Optional"><Input value={f.lotNo} onChange={set('lotNo')} placeholder={c.lotNo} /></Field>
          <Field label="New expiry" hint="Optional"><Input type="date" value={f.expiry} onChange={set('expiry')} /></Field>
        </div>
        <Field label="Note"><Input value={f.note} onChange={set('note')} placeholder="e.g. PO 4512, from Sigma" /></Field>
      </form>
    </Modal>
  );
}

function StocktakeModal({ c, onClose }) {
  const { profile } = useAuth();
  const toast = useToast();
  const [quantity, setQuantity] = useState(String(c.quantity ?? ''));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e?.preventDefault();
    setBusy(true);
    try {
      await setStock({ chemical: c, quantity: Number(quantity), note, profile });
      toast.success('Stock updated');
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={`Stocktake · ${c.name}`} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy}>Save count</Button></>}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-500">Set the exact amount on the shelf — for counting corrections, spills or disposal. The change is logged.</p>
        <Field label={`Amount on the shelf (${c.unit})`}><Input autoFocus inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></Field>
        <Field label="Reason"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Annual stocktake, bottle broken, disposed expired" /></Field>
      </form>
    </Modal>
  );
}

function ReorderModal({ c, onClose }) {
  const { profile } = useAuth();
  const toast = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      await requestReorder(c, profile, note);
      toast.success('Reorder requested — admins will see it.');
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={`Request more ${c.name}`} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy}>Send request</Button></>}>
      <div className="space-y-4">
        <p className="text-sm text-slate-500">{fmtQty(c.quantity, c.unit)} left. Admins see open requests on this page and on the Chemicals badge.</p>
        <Field label="Note" hint="Optional — how much you need and by when.">
          <Textarea autoFocus rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="e.g. Need 2 × 2.5 L for next week's runs" />
        </Field>
      </div>
    </Modal>
  );
}

// ── Admin: add / edit ────────────────────────────────────────────────────────

const BLANK = {
  name: '', formula: '', cas: '', category: '', grade: '', hazards: [], quantity: '', unit: 'g', minQuantity: '', containerSize: '',
  location: '', storage: '', supplier: '', catalogNo: '', lotNo: '', expiry: '', sdsURL: '', photo: '', notes: '',
};

function ChemicalForm({ c, chemicals, onClose, onSaved, onDeleted }) {
  const { profile } = useAuth();
  const toast = useToast();
  const [f, setF] = useState(() => (c ? { ...BLANK, ...c, expiry: toDateInput(c.expiry), quantity: String(c.quantity ?? ''), minQuantity: c.minQuantity || '', containerSize: c.containerSize || '' } : BLANK));
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const locations = useMemo(() => [...new Set(chemicals.map((x) => x.location).filter(Boolean))].sort(), [chemicals]);
  const suppliers = useMemo(() => [...new Set(chemicals.map((x) => x.supplier).filter(Boolean))].sort(), [chemicals]);
  const duplicate = !c && f.name.trim() && chemicals.find((x) => x.name.toLowerCase() === f.name.trim().toLowerCase() || (f.cas && x.cas === f.cas.trim()));
  const casBad = f.cas.trim() && !casValid(f.cas.trim());

  async function save(e) {
    e?.preventDefault();
    if (!f.name.trim()) return toast.error('Enter a name.');
    setBusy(true);
    try {
      if (c) {
        await updateChemical(c, f, profile);
        toast.success('Saved');
        onSaved(c.id);
      } else {
        const id = await createChemical(f, profile);
        toast.success(`${f.name.trim()} added`);
        onSaved(id);
      }
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!confirm(`Delete ${c.name} from the inventory? Its usage history stays in the log.`)) return;
    try {
      await deleteChemical(c.id);
      toast.success('Deleted');
      onDeleted();
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={c ? `Edit ${c.name}` : 'Add chemical'}
      footer={
        <>
          {c && <Button variant="plain" className="mr-auto !text-rose-600" onClick={remove}><Icon name="trash" className="h-4 w-4" /> Delete</Button>}
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={busy}>{c ? 'Save' : 'Add to inventory'}</Button>
        </>
      }
    >
      <form onSubmit={save} className="space-y-5">
        <datalist id="lb-chem-locations">{locations.map((l) => <option key={l} value={l} />)}</datalist>
        <datalist id="lb-chem-suppliers">{suppliers.map((l) => <option key={l} value={l} />)}</datalist>
        <div className="grid gap-3 sm:grid-cols-6">
          <Field label="Name" className="sm:col-span-4" hint={duplicate ? `Already in the inventory: ${duplicate.name}${duplicate.location ? ` (${duplicate.location})` : ''}` : null}>
            <Input autoFocus required value={f.name} onChange={set('name')} placeholder="e.g. Acetonitrile, HPLC grade" />
          </Field>
          <Field label="Formula" className="sm:col-span-2"><Input value={f.formula} onChange={set('formula')} placeholder="CH3CN" /></Field>
          <Field label="CAS number" className="sm:col-span-2" hint={casBad ? 'Check digit does not match — double-check the number.' : null}>
            <Input value={f.cas} onChange={set('cas')} placeholder="75-05-8" />
          </Field>
          <Field label="Category" className="sm:col-span-2">
            <Select value={f.category} onChange={set('category')}>
              <option value="">—</option>
              {[...new Set([...CATEGORIES, f.category].filter(Boolean))].map((x) => <option key={x}>{x}</option>)}
            </Select>
          </Field>
          <Field label="Grade / purity" className="sm:col-span-2"><Input value={f.grade} onChange={set('grade')} placeholder="≥99.9 %, HPLC" /></Field>
        </div>

        <div>
          <div className="mb-1.5 text-sm font-medium text-slate-600 dark:text-slate-300">Stock</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Quantity now" hint={c ? 'Changing it here is logged as a stocktake.' : null}><Input inputMode="decimal" value={f.quantity} onChange={set('quantity')} placeholder="0" /></Field>
            <Field label="Unit">
              <Select value={f.unit} onChange={set('unit')}>{UNITS.map((u) => <option key={u.value}>{u.value}</option>)}</Select>
            </Field>
            <Field label="Container size" hint="Full bottle, for the bar"><Input inputMode="decimal" value={f.containerSize} onChange={set('containerSize')} placeholder="2500" /></Field>
            <Field label="Reorder level" hint="Low-stock warning at"><Input inputMode="decimal" value={f.minQuantity} onChange={set('minQuantity')} placeholder="500" /></Field>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Location" hint="Room, cabinet or shelf"><Input list="lb-chem-locations" value={f.location} onChange={set('location')} placeholder="Room 204 · Cabinet A · Shelf 2" /></Field>
          <Field label="Storage">
            <Select value={f.storage} onChange={set('storage')}>
              <option value="">—</option>
              {[...new Set([...STORAGE, f.storage].filter(Boolean))].map((x) => <option key={x}>{x}</option>)}
            </Select>
          </Field>
        </div>

        <div>
          <div className="mb-1.5 text-sm font-medium text-slate-600 dark:text-slate-300">Hazards (GHS)</div>
          <div className="flex flex-wrap gap-2">
            {HAZARDS.map((h) => {
              const on = f.hazards.includes(h.value);
              return (
                <button
                  type="button"
                  key={h.value}
                  onClick={() => setF({ ...f, hazards: on ? f.hazards.filter((x) => x !== h.value) : [...f.hazards, h.value] })}
                  className={cx('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition', on ? 'bg-rose-600 text-white ring-rose-600' : 'text-slate-700 ring-black/10 hover:bg-black/[0.04] dark:text-slate-300 dark:ring-white/15')}
                >
                  <span aria-hidden="true">{h.symbol}</span> {h.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Supplier" className="sm:col-span-2"><Input list="lb-chem-suppliers" value={f.supplier} onChange={set('supplier')} placeholder="Sigma-Aldrich" /></Field>
          <Field label="Catalog no."><Input value={f.catalogNo} onChange={set('catalogNo')} /></Field>
          <Field label="Lot no."><Input value={f.lotNo} onChange={set('lotNo')} /></Field>
          <Field label="Expiry date"><Input type="date" value={f.expiry} onChange={set('expiry')} /></Field>
          <Field label="Safety data sheet link" className="sm:col-span-3"><Input type="url" value={f.sdsURL} onChange={set('sdsURL')} placeholder="https://…" /></Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Field label="Notes"><Textarea rows={3} value={f.notes} onChange={set('notes')} placeholder="Handling, preparation, who to ask…" /></Field>
          <ImageField value={f.photo} onChange={(v) => setF((x) => ({ ...x, photo: v || '' }))} kind="chemical" label="Photo" />
        </div>
      </form>
    </Modal>
  );
}

// ── Admin: CSV import ────────────────────────────────────────────────────────

function ImportModal({ onClose }) {
  const { profile } = useAuth();
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const parsed = useMemo(() => (text.trim() ? chemicalsFromCSV(text) : null), [text]);

  async function readFile(e) {
    const file = e.target.files?.[0];
    if (file) setText(await file.text());
  }
  async function run() {
    setBusy(true);
    try {
      const n = await importChemicals(parsed.items, profile);
      toast.success(`${n} chemical${n === 1 ? '' : 's'} imported`);
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="Import chemicals"
      footer={
        <>
          <Button variant="plain" className="mr-auto" onClick={() => downloadCSV('labboard-chemicals-template.csv', [{ name: 'Ethanol, absolute', formula: 'C2H6O', cas: '64-17-5', category: 'Solvents', quantity: 2500, unit: 'mL', minQuantity: 500, containerSize: 2500, location: 'Room 204 · Flammables cabinet', storage: 'Flammables cabinet', hazards: ['flammable', 'irritant'], supplier: 'Sigma-Aldrich', expiry: '2027-06-30' }], CSV_COLUMNS)}>
            <Icon name="download" className="h-4 w-4" /> Template
          </Button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={run} loading={busy} disabled={!parsed?.items.length}>Import {parsed?.items.length || ''}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          Upload a CSV (Excel → Save as → CSV) or paste rows below. The first row is the header; recognised columns: Name, Formula, CAS, Category, Grade, Quantity, Unit,
          Reorder level, Container size, Location, Storage, Hazards, Supplier, Catalog no, Lot no, Expiry (YYYY-MM-DD), SDS link, Notes. Only Name is required.
        </p>
        <input type="file" accept=".csv,.tsv,.txt,text/csv" onChange={readFile} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:px-3 file:py-2 file:font-semibold file:text-white" />
        <Textarea rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Name,Quantity,Unit,Location\nAcetone,2500,mL,Cabinet A'} className="font-mono text-sm" />
        {parsed && (
          <div className="space-y-2 text-sm">
            <p className="font-medium">{parsed.items.length} chemical{parsed.items.length === 1 ? '' : 's'} ready to import.</p>
            {parsed.items.slice(0, 5).map((x, i) => (
              <div key={i} className="truncate text-slate-500">· {x.name} — {x.quantity || 0} {x.unit}{x.location && ` · ${x.location}`}</div>
            ))}
            {parsed.items.length > 5 && <div className="text-slate-500">…and {parsed.items.length - 5} more</div>}
            {parsed.problems.map((p) => <div key={p} className="text-orange-700 dark:text-orange-300">{p}</div>)}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── Usage log ────────────────────────────────────────────────────────────────

function UsageLog() {
  const { profile } = useAuth();
  const [who, setWho] = useState('all');
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const logs = useLiveQuery(
    () =>
      who === 'mine'
        ? query(collection(db, 'chemicalLogs'), where('userId', '==', profile.uid), orderBy('createdAt', 'desc'), limit(200))
        : query(collection(db, 'chemicalLogs'), orderBy('createdAt', 'desc'), limit(200)),
    [who, profile?.uid],
  );
  const rows = logs.data.filter((l) => (!type || l.type === type) && (!q || `${l.chemicalName} ${l.userName} ${l.note}`.toLowerCase().includes(q.toLowerCase())));

  // What I used this month, summed per chemical.
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const summary = useMemo(() => {
    const m = new Map();
    for (const l of logs.data) {
      if (l.type !== 'use' || (toDate(l.createdAt) || new Date()) < monthStart) continue;
      const k = l.chemicalId;
      const cur = m.get(k) || { name: l.chemicalName, unit: l.unit, amount: 0, n: 0 };
      m.set(k, { ...cur, amount: round(cur.amount + l.amount), n: cur.n + 1 });
    }
    return [...m.values()].sort((a, b) => b.n - a.n).slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs.data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={who} onChange={setWho} options={[{ value: 'all', label: 'Everyone' }, { value: 'mine', label: 'Mine' }]} />
        <Select value={type} onChange={(e) => setType(e.target.value)} className="!w-auto min-w-[140px]" aria-label="Type">
          <option value="">All changes</option>
          <option value="use">Used</option>
          <option value="restock">Restocked</option>
          <option value="adjust">Stocktake</option>
          <option value="create">Added</option>
        </Select>
        <div className="relative min-w-[200px] flex-1">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chemical, person, note" className="!pl-9" type="search" />
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={!rows.length}
          onClick={() =>
            downloadCSV('labboard-chemical-log.csv', rows, [
              { label: 'Date', get: (l) => toDate(l.createdAt)?.toISOString() || '' },
              { label: 'Type', key: 'type' },
              { label: 'Chemical', key: 'chemicalName' },
              { label: 'Amount', key: 'amount' },
              { label: 'Unit', key: 'unit' },
              { label: 'Before', key: 'before' },
              { label: 'After', key: 'after' },
              { label: 'Person', key: 'userName' },
              { label: 'Note', key: 'note' },
              { label: 'Lot', key: 'lotNo' },
            ])
          }
        >
          <Icon name="download" className="h-4 w-4" /> CSV
        </Button>
      </div>

      {summary.length > 0 && (
        <div>
          <div className="mb-1.5 text-sm font-semibold uppercase tracking-wide text-slate-500">{who === 'mine' ? 'My use' : 'Most used'} this month</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {summary.map((s) => (
              <Card key={s.name} className="p-3">
                <div className="truncate text-sm text-slate-500">{s.name}</div>
                <div className="text-lg font-semibold tabular-nums">{fmtQty(s.amount, s.unit)}</div>
                <div className="text-xs text-slate-500">{s.n} time{s.n === 1 ? '' : 's'}</div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {logs.error ? (
        <EmptyState icon="warning" title="Could not load the log">{logs.error.message}</EmptyState>
      ) : logs.loading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon="history" title="No entries">Usage appears here when someone records it.</EmptyState>
      ) : (
        <div className="divide-y divide-black/[0.06] overflow-hidden rounded-xl bg-white shadow-card ring-1 ring-black/[0.06] dark:divide-white/[0.06] dark:bg-slate-900 dark:ring-white/[0.07]">
          {rows.map((l) => <LogRow key={l.id} l={l} showChemical />)}
        </div>
      )}
      {logs.data.length >= 200 && <p className="text-center text-sm text-slate-500">Showing the latest 200 entries. Export or filter for more.</p>}
    </div>
  );
}

// ── Reorder requests ─────────────────────────────────────────────────────────

function Requests({ chemicals, onOpen, act }) {
  const { isAdmin, profile } = useAuth();
  const toast = useToast();
  const requested = chemicals.filter((c) => c.reorder).sort((a, b) => (toDate(a.reorder.at) || 0) - (toDate(b.reorder.at) || 0));
  const suggested = chemicals.filter((c) => !c.reorder && ['out', 'low'].some((f) => chemStatus(c).flags.includes(f)));

  return (
    <div className="space-y-5">
      {requested.length === 0 ? (
        <EmptyState icon="check" title="No open requests">When someone asks for more of a chemical, it appears here until an admin restocks it.</EmptyState>
      ) : (
        <div className="divide-y divide-black/[0.06] overflow-hidden rounded-xl bg-white shadow-card ring-1 ring-black/[0.06] dark:divide-white/[0.06] dark:bg-slate-900 dark:ring-white/[0.07]">
          {requested.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <button className="min-w-0 flex-1 text-left" onClick={() => onOpen(c.id)}>
                <div className="font-semibold text-slate-900 dark:text-white">{c.name}</div>
                <div className="text-sm text-slate-500">
                  {fmtQty(c.quantity, c.unit)} left · requested by {c.reorder.name} {c.reorder.at && `on ${fmtDate(c.reorder.at)}`}
                  {c.supplier && ` · ${c.supplier}`}{c.catalogNo && ` ${c.catalogNo}`}
                </div>
                {c.reorder.note && <div className="mt-0.5 text-sm text-slate-700 dark:text-slate-300">“{c.reorder.note}”</div>}
              </button>
              {(isAdmin || c.reorder.uid === profile?.uid) && (
                <Button size="sm" variant="secondary" onClick={() => cancelReorder(c).then(() => toast.success('Request closed'), toast.error)}>
                  {c.reorder.uid === profile?.uid ? 'Withdraw' : 'Dismiss'}
                </Button>
              )}
              {isAdmin && <Button size="sm" onClick={() => act('restock', c)}>Restock</Button>}
            </div>
          ))}
        </div>
      )}

      {suggested.length > 0 && (
        <div>
          <div className="mb-1.5 text-sm font-semibold uppercase tracking-wide text-slate-500">Low or out of stock, not yet requested</div>
          <div className="divide-y divide-black/[0.06] overflow-hidden rounded-xl bg-white shadow-card ring-1 ring-black/[0.06] dark:divide-white/[0.06] dark:bg-slate-900 dark:ring-white/[0.07]">
            {suggested.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                <button className="min-w-0 flex-1 text-left" onClick={() => onOpen(c.id)}>
                  <span className="font-medium text-slate-900 dark:text-white">{c.name}</span>
                  <span className="text-sm text-slate-500"> · {fmtQty(c.quantity, c.unit)} left{c.minQuantity > 0 && ` (reorder at ${fmtQty(c.minQuantity, c.unit)})`}</span>
                </button>
                <StatusChip kind={chemStatus(c).kind} />
                {isAdmin ? (
                  <Button size="sm" variant="secondary" onClick={() => act('restock', c)}>Restock</Button>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => act('reorder', c)}>Request</Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
