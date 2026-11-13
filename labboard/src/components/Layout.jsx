import { useState } from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useData } from '../contexts/DataContext';
import { useReminders } from '../hooks/useReminders';
import { Avatar, Icon, cx } from './ui';
import { asset } from '../lib/paths';
import { OverdueGuard } from './OverdueGuard';
import { InstallPrompt } from './InstallPrompt';

const NAV = [
  { to: '/', label: 'Dashboard', icon: 'home', end: true },
  { to: '/timeline', label: 'Timeline', icon: 'timeline' },
  { to: '/start', label: 'Start', icon: 'play', member: true },
  { to: '/my', label: 'My session', icon: 'user', member: true },
  { to: '/bookings', label: 'Bookings', icon: 'calendar' },
  { to: '/history', label: 'History', icon: 'history' },
  { to: '/maintenance', label: 'Maintenance', icon: 'wrench' },
  { to: '/stats', label: 'Statistics', icon: 'chart' },
  { to: '/admin', label: 'Admin', icon: 'shield', admin: true },
];

export function Layout() {
  const { profile, isAdmin, isMember, signOut } = useAuth();
  const { dark, toggle } = useTheme();
  const { activeSessions, openIssues } = useData();
  const [menu, setMenu] = useState(false);
  useReminders();

  const mySessions = activeSessions.filter((s) => s.userId === profile?.uid);
  const items = NAV.filter((n) => (!n.admin || isAdmin) && (!n.member || isMember));
  const badge = (to) => (to === '/my' ? mySessions.length : to === '/admin' ? openIssues.length : 0);

  return (
    <div className="min-h-screen pb-24 md:pb-8">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
          <Link to="/" className="flex items-center gap-2 font-extrabold tracking-tight text-slate-900 dark:text-white">
            <img src={asset('icons/icon.svg')} alt="" className="h-7 w-7" />
            LabBoard
          </Link>
          <nav className="hidden flex-1 items-center gap-1 overflow-x-auto lg:flex">
            {items.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  cx(
                    'relative whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm font-medium',
                    isActive ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
                  )
                }
              >
                {n.label}
                {badge(n.to) > 0 && <span className="ml-1 rounded-full bg-indigo-600 px-1.5 text-[10px] font-bold text-white">{badge(n.to)}</span>}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <Link to="/board" title="Big-screen mode" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
              <Icon name="tv" />
            </Link>
            <button onClick={toggle} title="Toggle dark mode" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
              <Icon name={dark ? 'sun' : 'moon'} />
            </button>
            <div className="relative">
              <button onClick={() => setMenu((m) => !m)} className="flex items-center gap-2 rounded-full p-0.5" aria-label="Account menu">
                <Avatar src={profile?.photoURL} name={profile?.name} />
              </button>
              {menu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
                  <div className="absolute right-0 z-50 mt-2 w-64 rounded-2xl bg-white p-2 shadow-xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
                    <div className="px-3 py-2">
                      <div className="truncate font-semibold text-slate-900 dark:text-white">{profile?.name}</div>
                      <div className="truncate text-xs text-slate-500">{profile?.email}</div>
                      <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-indigo-600">{profile?.role}</div>
                    </div>
                    <div className="lg:hidden">
                      {items.map((n) => (
                        <Link key={n.to} to={n.to} onClick={() => setMenu(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800">
                          <Icon name={n.icon} className="h-4 w-4" /> {n.label}
                        </Link>
                      ))}
                    </div>
                    <button onClick={signOut} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950">
                      <Icon name="logout" className="h-4 w-4" /> Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5">
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto grid max-w-md grid-cols-5">
          {[
            { to: '/', label: 'Board', icon: 'home', end: true },
            { to: '/timeline', label: 'Timeline', icon: 'timeline' },
            ...(isMember ? [{ to: '/start', label: 'Start', icon: 'play', primary: true }] : [{ to: '/history', label: 'History', icon: 'history' }]),
            ...(isMember ? [{ to: '/my', label: 'Mine', icon: 'user' }] : [{ to: '/stats', label: 'Stats', icon: 'chart' }]),
            { to: '/bookings', label: 'Book', icon: 'calendar' },
          ].map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cx('relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500')}>
              {n.primary ? (
                <span className="-mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg">
                  <Icon name={n.icon} className="h-6 w-6" />
                </span>
              ) : (
                <Icon name={n.icon} className="h-6 w-6" />
              )}
              {n.label}
              {badge(n.to) > 0 && <span className="absolute right-4 top-1 h-2 w-2 rounded-full bg-indigo-600" />}
            </NavLink>
          ))}
        </div>
      </nav>

      <OverdueGuard />
      <InstallPrompt />
    </div>
  );
}
