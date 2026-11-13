import { useEffect, useState } from 'react';
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useData } from '../contexts/DataContext';
import { useReminders } from '../hooks/useReminders';
import { useNow } from '../hooks/useNow';
import { Avatar, Icon, cx } from './ui';
import { asset } from '../lib/paths';
import { OverdueGuard } from './OverdueGuard';
import { InstallPrompt } from './InstallPrompt';

// Sidebar sections, like Finder / Mail. `tint` colours the icon the way macOS sidebar icons are tinted.
const SECTIONS = [
  {
    title: 'Lab',
    items: [
      { to: '/', label: 'Dashboard', icon: 'grid', end: true },
      { to: '/timeline', label: 'Timeline', icon: 'timeline' },
      { to: '/bookings', label: 'Bookings', icon: 'calendar' },
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

const standalone = '[@media(display-mode:standalone)]';

function TrafficLights() {
  // Decorative window controls; hidden when installed as an app (the OS draws real ones).
  return (
    <div className={cx('flex gap-2', `${standalone}:hidden`)} aria-hidden="true">
      <span className="h-3 w-3 rounded-full bg-[#ff5f57] ring-[0.5px] ring-inset ring-black/15" />
      <span className="h-3 w-3 rounded-full bg-[#febc2e] ring-[0.5px] ring-inset ring-black/15" />
      <span className="h-3 w-3 rounded-full bg-[#28c840] ring-[0.5px] ring-inset ring-black/15" />
    </div>
  );
}

function useBadges() {
  const { profile } = useAuth();
  const { activeSessions, openIssues } = useData();
  const mine = activeSessions.filter((s) => s.userId === profile?.uid).length;
  return (to) => (to === '/my' ? mine : to === '/admin' ? openIssues.length : 0);
}

function Sidebar() {
  const { profile, isAdmin, isMember, signOut } = useAuth();
  const badge = useBadges();
  const [menu, setMenu] = useState(false);
  return (
    <aside className="vibrancy hairline hidden w-[232px] shrink-0 flex-col border-r lg:flex">
      <div className="flex h-[52px] shrink-0 items-center px-5">
        <TrafficLights />
      </div>
      <div className="flex items-center gap-2.5 px-4 pb-3">
        <img src={asset('icons/icon.svg')} alt="" className="h-8 w-8 drop-shadow-sm" />
        <div className="min-w-0 leading-tight">
          <div className="text-[13px] font-semibold text-slate-900 dark:text-white">LabBoard</div>
          <div className="text-[11px] text-slate-500">AFMN Lab</div>
        </div>
      </div>
      <nav className="flex-1 space-y-4 overflow-y-auto px-2.5 pb-4">
        {SECTIONS.filter((s) => (!s.admin || isAdmin) && (!s.member || isMember)).map((s) => (
          <div key={s.title}>
            <div className="px-2.5 pb-1 text-[11px] font-semibold text-slate-500/90">{s.title}</div>
            {s.items.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  cx(
                    'group flex h-7 items-center gap-2 rounded-md px-2.5 text-[13px] transition-colors',
                    isActive ? 'bg-black/[0.08] font-medium text-slate-900 dark:bg-white/[0.12] dark:text-white' : 'text-slate-700 hover:bg-black/[0.04] dark:text-slate-300 dark:hover:bg-white/[0.05]',
                  )
                }
              >
                <Icon name={n.icon} className="h-[17px] w-[17px] text-indigo-600 dark:text-indigo-400" strokeWidth={1.9} />
                <span className="flex-1 truncate">{n.label}</span>
                {badge(n.to) > 0 && <span className="text-[11px] font-medium tabular-nums text-slate-500">{badge(n.to)}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="hairline relative border-t p-2.5">
        <button onClick={() => setMenu((m) => !m)} className="flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left hover:bg-black/[0.05] dark:hover:bg-white/[0.06]" aria-label="Account menu">
          <Avatar src={profile?.photoURL} name={profile?.name} size="h-7 w-7" />
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-[13px] font-medium text-slate-900 dark:text-white">{profile?.name}</span>
            <span className="block truncate text-[11px] capitalize text-slate-500">{profile?.role}</span>
          </span>
          <Icon name="more" className="h-4 w-4 text-slate-400" />
        </button>
        {menu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
            <div className="vibrancy-strong absolute bottom-full left-2.5 right-2.5 z-50 mb-1 animate-zoom-in rounded-xl p-1 shadow-sheet dark:ring-1 dark:ring-white/10">
              <div className="truncate px-2.5 py-1.5 text-[11px] text-slate-500">{profile?.email}</div>
              <button onClick={signOut} className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-slate-800 hover:bg-indigo-600 hover:text-white dark:text-slate-100">
                <Icon name="logout" className="h-4 w-4" /> Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

function Toolbar({ onMore }) {
  const { profile } = useAuth();
  const { dark, toggle } = useTheme();
  const { activeSessions } = useData();
  const now = useNow(30 * 1000);
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const btn = 'rounded-lg p-2 text-slate-500 transition hover:bg-black/[0.05] hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/[0.08] dark:hover:text-white lg:p-1.5';
  return (
    <header className="vibrancy-strong hairline pt-safe sticky top-0 z-30 border-b lg:bg-white/60 lg:dark:bg-[#1c1c1e]/60">
      <div className="flex h-12 items-center gap-3 px-4 lg:h-[52px] lg:px-5">
        {/* Phone: app identity on the left */}
        <Link to="/" className="flex items-center gap-2 lg:hidden">
          <img src={asset('icons/icon.svg')} alt="" className="h-7 w-7" />
          <span className="text-[17px] font-semibold tracking-tight text-slate-900 dark:text-white">LabBoard</span>
        </Link>
        {/* Desktop: live status in the title bar */}
        <div className="hidden min-w-0 items-center gap-2 text-[13px] lg:flex">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <span className="font-semibold text-slate-800 dark:text-slate-100">Live</span>
          <span className="text-slate-400">·</span>
          <span className="truncate text-slate-500">{activeSessions.length} session{activeSessions.length === 1 ? '' : 's'} running</span>
        </div>
        <div className="ml-auto flex items-center gap-0.5">
          <span className="mr-2 hidden font-mono text-[13px] tabular-nums text-slate-500 sm:inline">{time}</span>
          <Link to="/board" title="Big-screen mode" className={btn}>
            <Icon name="tv" className="h-[18px] w-[18px]" />
          </Link>
          <button onClick={toggle} title={dark ? 'Light appearance' : 'Dark appearance'} className={btn}>
            <Icon name={dark ? 'sun' : 'moon'} className="h-[18px] w-[18px]" />
          </button>
          <button onClick={onMore} className="ml-1 rounded-full lg:hidden" aria-label="Account and more">
            <Avatar src={profile?.photoURL} name={profile?.name} size="h-8 w-8" />
          </button>
        </div>
      </div>
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
    <nav className="vibrancy-strong hairline pb-safe fixed inset-x-0 bottom-0 z-40 border-t lg:hidden" aria-label="Main">
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
              <div className="truncate text-[13px] text-slate-500">{profile?.email}</div>
              <div className="text-[13px] capitalize text-indigo-600">{profile?.role}</div>
            </div>
          </div>
          <div className="divide-y divide-black/[0.06] overflow-hidden rounded-xl bg-white shadow-card ring-1 ring-black/[0.06] dark:divide-white/[0.06] dark:bg-slate-900 dark:ring-white/[0.07]">
            {rows.map((r) => (
              <Link key={r.to} to={r.to} onClick={onClose} className="flex items-center gap-3 px-3 py-2.5 active:bg-slate-100 dark:active:bg-white/5">
                <span className={cx('flex h-[29px] w-[29px] items-center justify-center rounded-[7px] text-white', r.tint)}>
                  <Icon name={r.icon} className="h-[18px] w-[18px]" strokeWidth={2} />
                </span>
                <span className="flex-1 text-[17px]">{r.label}</span>
                {badge(r.to) > 0 && <span className="rounded-full bg-rose-500 px-2 text-[13px] font-semibold text-white">{badge(r.to)}</span>}
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
    <div className={cx('min-h-[100dvh] lg:h-[100dvh] lg:overflow-hidden xl:wallpaper xl:p-6 2xl:p-10', `${standalone}:!bg-none ${standalone}:!p-0`)}>
      <div
        className={cx(
          'flex min-h-[100dvh] bg-slate-50 dark:bg-slate-950 lg:h-full lg:min-h-0 lg:overflow-hidden xl:mx-auto xl:max-w-[1640px] xl:rounded-xl xl:bg-slate-50/80 xl:shadow-window xl:backdrop-blur-xl xl:dark:bg-slate-950/90 xl:dark:shadow-window-dark',
          `${standalone}:!max-w-none ${standalone}:!rounded-none ${standalone}:!shadow-none`,
        )}
      >
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col bg-slate-50 dark:bg-slate-950 lg:bg-[#fbfbfd] lg:dark:bg-[#1a1a1c]">
          <Toolbar onMore={() => setMore(true)} />
          <main id="lb-main" className="flex-1 lg:overflow-y-auto">
            <div className="mx-auto max-w-6xl px-4 pb-28 pt-4 sm:px-6 lg:px-8 lg:pb-10 lg:pt-6">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
      <TabBar onMore={() => setMore((m) => !m)} moreOpen={more} />
      <MoreSheet open={more} onClose={() => setMore(false)} />
      <OverdueGuard />
      <InstallPrompt />
    </div>
  );
}
