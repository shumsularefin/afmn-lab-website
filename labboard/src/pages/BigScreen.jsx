import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useData } from '../contexts/DataContext';
import { useNow } from '../hooks/useNow';
import { SummaryStrip } from '../components/SummaryStrip';
import { InstrumentCard } from '../components/InstrumentCard';
import { DayTimeline } from '../components/DayTimeline';
import { Icon } from '../components/ui';
import { asset } from '../lib/paths';
import { useDerived, countKinds } from './Dashboard';

const ORDER = { overdue: 0, busy: 1, booked: 2, free: 3, oos: 4 };
const ROTATE_MS = 30 * 1000;

/** Full-screen view for a wall monitor: cards and timeline alternate every 30 s. */
export default function BigScreen() {
  const { profile } = useAuth();
  const { dark, toggle } = useTheme();
  const { bookings, activeSessions, instruments } = useData();
  const now = useNow(1000);
  const [view, setView] = useState('cards');
  const [auto, setAuto] = useState(true);
  const items = useDerived(now).sort((a, b) => ORDER[a.d.kind] - ORDER[b.d.kind]);
  const counts = countKinds(items);

  useEffect(() => {
    if (!auto) return undefined;
    const t = setInterval(() => setView((v) => (v === 'cards' ? 'timeline' : 'cards')), ROTATE_MS);
    return () => clearInterval(t);
  }, [auto]);

  // Keep the monitor awake.
  useEffect(() => {
    let lock;
    const req = async () => {
      try {
        lock = await navigator.wakeLock?.request('screen');
      } catch {
        /* ignore */
      }
    };
    req();
    const onVis = () => document.visibilityState === 'visible' && req();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      lock?.release?.();
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 p-6 dark:bg-slate-950">
      <div className="mb-5 flex items-center gap-4">
        <img src={asset('icons/icon.svg')} alt="" className="h-12 w-12" />
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white">LabBoard</h1>
        <div className="ml-auto text-right">
          <div className="font-mono text-5xl font-bold tabular-nums text-slate-900 dark:text-white">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
          <div className="text-lg text-slate-500">{now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</div>
        </div>
        <div className="flex flex-col gap-1">
          <button onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())} className="rounded-lg p-2 text-slate-400 hover:bg-slate-200 dark:hover:bg-white/[0.06]" title="Full screen">
            <Icon name="expand" className="h-6 w-6" />
          </button>
          <button onClick={toggle} className="rounded-lg p-2 text-slate-400 hover:bg-slate-200 dark:hover:bg-white/[0.06]" title="Toggle dark mode">
            <Icon name={dark ? 'sun' : 'moon'} className="h-6 w-6" />
          </button>
          <button onClick={() => { setAuto(false); setView((v) => (v === 'cards' ? 'timeline' : 'cards')); }} className="rounded-lg p-2 text-slate-400 hover:bg-slate-200 dark:hover:bg-white/[0.06]" title="Switch view">
            <Icon name="timeline" className="h-6 w-6" />
          </button>
          <Link to="/" className="rounded-lg p-2 text-slate-400 hover:bg-slate-200 dark:hover:bg-white/[0.06]" title="Exit big-screen mode"><Icon name="x" className="h-6 w-6" /></Link>
        </div>
      </div>

      <SummaryStrip counts={counts} big />

      <div className="mt-6">
        {view === 'cards' ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {items.map(({ inst, d }) => <InstrumentCard key={inst.id} inst={inst} d={d} now={now} myUid={profile.uid} big />)}
          </div>
        ) : (
          <DayTimeline instruments={instruments} day={now} bookings={bookings} activeSessions={activeSessions} now={now} big />
        )}
      </div>
      {auto && <div className="mt-4 text-center text-sm text-slate-400">Switching view every 30 s · tap the timeline icon to pin a view</div>}
    </div>
  );
}
