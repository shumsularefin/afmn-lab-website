import { useEffect, useState } from 'react';
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useData } from '../contexts/DataContext';
import { useReminders } from '../hooks/useReminders';
import { useNow } from '../hooks/useNow';
import { Avatar, Icon, cx } from './ui';
import { asset } from '../lib/paths';
import { toDate } from '../lib/time';
import { OverdueGuard } from './OverdueGuard';
import { InstallPrompt } from './InstallPrompt';

// Sidebar sections. Kept short so the everyday pages are always one click away.
const SECTIONS = [
  {
    title: 'Lab',
    items: [
      { to: '/', label: 'Dashboard', icon: 'grid', end: true },
      { to: '/timeline', label: 'Timeline', icon: 'timeline' },
      { to: '/bookings', label: 'Bookings', icon: 'calendar' },
      { to: '/chemicals', label: 'Chemicals', icon: 'flask' },
    ],
  },
  {
    title: 'My work',
    member: true,
    items: [
      { to: '/start', label: 'Start session', icon: 'play' },
      { to: '/my', label: 'My session', icon: 'user' },
    ],
  },
  {
    title: 'Records',
    items: [
      { to: '/history', label: 'History', icon: 'history' },
      { to: '/maintenance', label: 'Maintenance', icon: 'wrench' },
      { to: '/stats', label: 'Statistics', icon: 'chart' },
    ],
  },
  { title: 'Manage', admin: true, items: [{ to: '/admin', label: 'Admin', icon: 'shield' }] },
];

function useBadges() {
  const { profile, isAdmin } = useAuth();
  const { activeSessions, openIssues, reorders } = useData();
  const mine = activeSessions.filter((s) => s.userId === profile?.uid).length;
  // Admins see open reorder requests on Chemicals; everyone sees their own running sessions.
  const counts = { '/my': mine, '/admin': openIssues.length, '/chemicals': isAdmin ? reorders.length : 0 };
  return (to) => counts[to] || 0;
}

function Sidebar() {
  const { profile, isAdmin, isMember, signOut } = useAuth();
  const badge = useBadges();
  const [menu, setMenu] = useState(false);
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-black/[0.08] bg-white dark:border-white/[0.08] dark:bg-[#1c1c1e] lg:flex">
      <Link to="/" className="flex h-16 shrink-0 items-center gap-2.5 px-5">
        <img src={asset('icons/icon.svg')} alt="" className="h-8 w-8" />
        <div className="min-w-0 leading-tight">
          <div className="text-[15px] font-semibold text-slate-900 dark:text-white">LabBoard</div>
          <div className="text-xs text-slate-500">AFMN Lab</div>
        </div>
      </Link>
      {isMember && (
        <div className="px-3 pb-3">
          <Link to="/start" className="flex h-10 items-center justify-center gap-2 rounded-xl bg-indigo-600 text-[15px] font-semibold text-white transition hover:bg-indigo-700">
            <Icon name="play" className="h-4 w-4" strokeWidth={2.2} /> Start session
          </Link>
        </div>
      )}
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4 pt-1">
        {SECTIONS.filter((s) => (!s.admin || isAdmin) && (!s.member || isMember)).map((s) => (
          <div key={s.title}>
            <div className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{s.title}</div>
            {s.items.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  cx(
                    'flex h-9 items-center gap-3 rounded-lg px-3 text-[15px] transition-colors',
                    isActive ? 'bg-indigo-600/10 font-semibold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300' : 'text-slate-700 hover:bg-black/[0.04] dark:text-slate-300 dark:hover:bg-white/[0.06]',
                  )
                }
              >
                <Icon name={n.icon} className="h-[18px] w-[18px] shrink-0" strokeWidth={1.9} />
                <span className="flex-1 truncate">{n.label}</span>
                {badge(n.to) > 0 && <span className="min-w-[20px] rounded-full bg-rose-500 px-1.5 text-center text-xs font-semibold leading-5 text-white">{badge(n.to)}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="relative border-t border-black/[0.08] p-3 dark:border-white/[0.08]">
        <button onClick={() => setMenu((m) => !m)} className="flex w-full items-center gap-3 rounded-lg p-1.5 text-left hover:bg-black/[0.04] dark:hover:bg-white/[0.06]" aria-label="Account menu">
          <Avatar src={profile?.photoURL} name={profile?.name} size="h-8 w-8" />
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">{profile?.name}</span>
            <span className="block truncate text-xs capitalize text-slate-500">{profile?.role}</span>
          </span>
          <Icon name="more" className="h-4 w-4 text-slate-500" />
        </button>
        {menu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
            <div className="absolute bottom-full left-3 right-3 z-50 mb-1 rounded-xl bg-white p-1 shadow-sheet dark:bg-[#2c2c2e]">
              <div className="truncate px-3 py-2 text-xs text-slate-500">{profile?.email}</div>
              <button onClick={signOut} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-600 hover:bg-rose-500/10">
                <Icon name="logout" className="h-4 w-4" /> Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

// "You have qPCR until 7:51 · 42 min left" — visible on every page so nobody has to go looking for it.
function MySessionChip() {
  const { profile } = useAuth();
  const { activeSessions } = useData();
  const now = useNow(15 * 1000);
  const mine = activeSessions.filter((s) => s.userId === profile?.uid);
  if (!mine.length) return null;
  const s = mine[0];
  const end = toDate(s.expectedEnd);
  const mins = Math.round((end - now) / 60000);
  const over = mins < 0;
  const left = over ? `${fmtMins(-mins)} overdue` : `${fmtMins(mins)} left`;
  return (
    <Link
      to="/my"
      className={cx(
        'flex min-w-0 items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold transition',
        over ? 'bg-orange-500/15 text-orange-800 hover:bg-orange-500/25 dark:text-orange-300' : 'bg-indigo-600/10 text-indigo-700 hover:bg-indigo-600/15 dark:text-indigo-300',
      )}
    >
      <span className={cx('h-2 w-2 shrink-0 rounded-full', over ? 'bg-orange-500' : 'bg-indigo-600')} />
      <span className="truncate">{mine.length > 1 ? `${mine.length} sessions` : s.instrumentName}</span>
      <span className="shrink-0 font-normal tabular-nums">· {left}</span>
    </Link>
  );
}

function fmtMins(m) {
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
}

function Toolbar({ onMore }) {
  const { profile } = useAuth();
  const { dark, toggle } = useTheme();
  const { activeSessions } = useData();
  const now = useNow(30 * 1000);
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const btn = 'rounded-lg p-2 text-slate-600 transition hover:bg-black/[0.05] hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.08] dark:hover:text-white';
  return (
    <header className="pt-safe sticky top-0 z-30 border-b border-black/[0.08] bg-white dark:border-white/[0.08] dark:bg-[#1c1c1e]">
      <div className="flex h-14 items-center gap-3 px-4 lg:h-16 lg:px-8">
        {/* Phone: app identity on the left */}
        <Link to="/" className="flex shrink-0 items-center gap-2 lg:hidden">
          <img src={asset('icons/icon.svg')} alt="" className="h-7 w-7" />
          <span className="text-[17px] font-semibold tracking-tight text-slate-900 dark:text-white">LabBoard</span>
        </Link>
        <div className="hidden shrink-0 items-center gap-2 text-sm lg:flex">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="text-slate-600 dark:text-slate-300">
            <b className="font-semibold text-slate-900 dark:text-white">{activeSessions.length}</b> session{activeSessions.length === 1 ? '' : 's'} running
          </span>
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-1">
          <div className="hidden min-w-0 sm:block"><MySessionChip /></div>
          <span className="mx-2 hidden font-mono text-sm tabular-nums text-slate-600 dark:text-slate-400 md:inline">{time}</span>
          <Link to="/board" title="Big-screen mode" className={btn}>
            <Icon name="tv" className="h-5 w-5" />
          </Link>
          <button onClick={toggle} title={dark ? 'Light mode' : 'Dark mode'} className={btn}>
            <Icon name={dark ? 'sun' : 'moon'} className="h-5 w-5" />
          </button>
          <button onClick={onMore} className="ml-1 rounded-full lg:hidden" aria-label="Account and more">
            <Avatar src={profile?.photoURL} name={profile?.name} size="h-8 w-8" />
          </button>
        </div>
      </div>
      {/* Phone: your running session sits right under the top bar */}
      <div className="px-4 pb-2 empty:hidden sm:hidden"><MySessionChip /></div>
    </header>
  );
}

function TabBar({ onMore, moreOpen }) {
  const { isMember } = useAuth();
  const badge = useBadges();
  const tabs = [
    { to: '/', label: 'Board', icon: 'grid', end: true },
    { to: '/bookings', label: 'Book', icon: 'calendar' },
    ...(isMember ? [{ to: '/start', label: 'Start', icon: 'play' }, { to: '/my', label: 'Mine', icon: 'user' }] : [{ to: '/timeline', label: 'Timeline', icon: 'timeline' }, { to: '/history', label: 'History', icon: 'history' }]),
  ];
  const item = (active) => cx('relative flex flex-1 flex-col items-center gap-[3px] pt-1.5 text-[10px] font-medium transition-colors', active ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400');
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-black/[0.08] bg-white dark:border-white/[0.08] dark:bg-[#1c1c1e] lg:hidden" aria-label="Main">
      <div className="mx-auto flex h-[52px] max-w-lg">
        {tabs.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => item(isActive && !moreOpen)}>
            {({ isActive }) => (
              <>
                <Icon name={n.icon} className="h-[26px] w-[26px]" strokeWidth={isActive && !moreOpen ? 2.1 : 1.6} />
                {n.label}
                {badge(n.to) > 0 && <span className="absolute left-1/2 top-1 ml-2 min-w-[16px] rounded-full bg-rose-500 px-1 text-center text-[10px] font-semibold leading-4 text-white">{badge(n.to)}</span>}
              </>
            )}
          </NavLink>
        ))}
        <button onClick={onMore} className={item(moreOpen)}>
          <Icon name="more" className="h-[26px] w-[26px]" strokeWidth={moreOpen ? 2.6 : 2} />
          More
          {badge('/admin') > 0 && <span className="absolute left-1/2 top-1 ml-2 h-2 w-2 rounded-full bg-rose-500" />}
        </button>
      </div>
    </nav>
  );
}

function MoreSheet({ open, onClose }) {
  const { profile, isAdmin, signOut } = useAuth();
  const { dark, toggle } = useTheme();
  const badge = useBadges();
  if (!open) return null;
  const rows = [
    { to: '/chemicals', label: 'Chemicals', icon: 'flask', tint: 'bg-teal-500' },
    { to: '/timeline', label: 'Timeline', icon: 'timeline', tint: 'bg-indigo-500' },
    { to: '/history', label: 'History', icon: 'history', tint: 'bg-slate-500' },
    { to: '/maintenance', label: 'Maintenance', icon: 'wrench', tint: 'bg-orange-500' },
    { to: '/stats', label: 'Statistics', icon: 'chart', tint: 'bg-emerald-500' },
    ...(isAdmin ? [{ to: '/admin', label: 'Admin', icon: 'shield', tint: 'bg-violet-500' }] : []),
    { to: '/board', label: 'Big-screen mode', icon: 'tv', tint: 'bg-sky-500' },
  ];
  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="More">
      <div className="absolute inset-0 animate-fade-in bg-black/30" onClick={onClose} />
      <div className="pb-safe absolute inset-x-0 bottom-0 max-h-[88vh] animate-sheet-up overflow-y-auto rounded-t-[22px] bg-slate-50 dark:bg-slate-950">
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-slate-300 dark:bg-white/20" />
        <div className="space-y-5 p-4">
          <div className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-card ring-1 ring-black/[0.06] dark:bg-slate-900 dark:ring-white/[0.07]">
            <Avatar src={profile?.photoURL} name={profile?.name} size="h-14 w-14" />
            <div className="min-w-0">
              <div className="truncate text-[17px] font-semibold">{profile?.name}</div>
              <div className="truncate text-sm text-slate-500">{profile?.email}</div>
              <div className="text-sm capitalize text-indigo-600">{profile?.role}</div>
            </div>
          </div>
          <div className="divide-y divide-black/[0.06] overflow-hidden rounded-xl bg-white shadow-card ring-1 ring-black/[0.06] dark:divide-white/[0.06] dark:bg-slate-900 dark:ring-white/[0.07]">
            {rows.map((r) => (
              <Link key={r.to} to={r.to} onClick={onClose} className="flex items-center gap-3 px-3 py-2.5 active:bg-slate-100 dark:active:bg-white/5">
                <span className={cx('flex h-[29px] w-[29px] items-center justify-center rounded-[7px] text-white', r.tint)}>
                  <Icon name={r.icon} className="h-[18px] w-[18px]" strokeWidth={2} />
                </span>
                <span className="flex-1 text-[17px]">{r.label}</span>
                {badge(r.to) > 0 && <span className="rounded-full bg-rose-500 px-2 text-sm font-semibold text-white">{badge(r.to)}</span>}
                <Icon name="chevron" className="h-4 w-4 text-slate-300 dark:text-slate-600" strokeWidth={2.4} />
              </Link>
            ))}
          </div>
          <div className="divide-y divide-black/[0.06] overflow-hidden rounded-xl bg-white shadow-card ring-1 ring-black/[0.06] dark:divide-white/[0.06] dark:bg-slate-900 dark:ring-white/[0.07]">
            <button onClick={toggle} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
              <span className="flex h-[29px] w-[29px] items-center justify-center rounded-[7px] bg-slate-800 text-white dark:bg-slate-600">
                <Icon name={dark ? 'sun' : 'moon'} className="h-[18px] w-[18px]" strokeWidth={2} />
              </span>
              <span className="flex-1 text-[17px]">Dark appearance</span>
              <span className={cx('relative h-[31px] w-[51px] rounded-full transition-colors', dark ? 'bg-emerald-500' : 'bg-slate-200')}>
                <span className={cx('absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow transition-transform', dark ? 'translate-x-[22px]' : 'translate-x-[2px]')} />
              </span>
            </button>
            <button onClick={signOut} className="w-full px-3 py-3 text-center text-[17px] text-rose-500">Sign out</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Layout() {
  const [more, setMore] = useState(false);
  const { pathname } = useLocation();
  useReminders();
  useEffect(() => {
    setMore(false);
    document.getElementById('lb-main')?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div className="min-h-[100dvh] bg-slate-50 dark:bg-slate-950 lg:flex lg:h-[100dvh] lg:overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Toolbar onMore={() => setMore(true)} />
        <main id="lb-main" className="flex-1 lg:overflow-y-auto">
          <div className="mx-auto max-w-7xl px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-12 lg:pt-7">
            <Outlet />
          </div>
        </main>
      </div>
      <TabBar onMore={() => setMore((m) => !m)} moreOpen={more} />
      <MoreSheet open={more} onClose={() => setMore(false)} />
      <OverdueGuard />
      <InstallPrompt />
    </div>
  );
}
