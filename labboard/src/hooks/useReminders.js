import { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useNow } from './useNow';
import { toDate, fmtTime, MIN } from '../lib/time';
import { asset } from '../lib/paths';
import { useToast } from '../contexts/ToastContext';

const KEY = 'labboard-fired-reminders';

async function notify(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) return reg.showNotification(title, { body, icon: asset('icons/icon-192.png'), badge: asset('icons/icon-192.png'), tag: title });
    new Notification(title, { body, icon: asset('icons/icon-192.png') });
  } catch {
    /* ignore */
  }
}

export function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') return Notification.requestPermission();
  return Promise.resolve(window.Notification?.permission);
}

/**
 * In-app + browser notifications while LabBoard is open in a tab or as an
 * installed PWA. (True background push needs a server → see README.)
 */
export function useReminders() {
  const { profile } = useAuth();
  const { activeSessions, bookings } = useData();
  const toast = useToast();
  const now = useNow(30 * 1000);
  const fired = useRef(null);

  if (fired.current == null) {
    try {
      fired.current = new Set(JSON.parse(sessionStorage.getItem(KEY) || '[]'));
    } catch {
      fired.current = new Set();
    }
  }

  useEffect(() => {
    if (!profile?.uid || profile.notify === false) return;
    const once = (key, title, body) => {
      if (fired.current.has(key)) return;
      fired.current.add(key);
      try {
        sessionStorage.setItem(KEY, JSON.stringify([...fired.current].slice(-200)));
      } catch {
        /* ignore */
      }
      toast.info(`${title} — ${body}`);
      notify(title, body);
    };
    const t = now.getTime();

    for (const s of activeSessions) {
      if (s.userId !== profile.uid) continue;
      const end = toDate(s.expectedEnd).getTime();
      const endKey = end; // re-arms after extending
      if (end - t <= 10 * MIN && end > t) once(`soon:${s.id}:${endKey}`, `${s.instrumentName}: 10 minutes left`, `Your session ends at ${fmtTime(end)}.`);
      if (t >= end) {
        const bucket = Math.floor((t - end) / (30 * MIN));
        once(`over:${s.id}:${endKey}:${bucket}`, `${s.instrumentName} is overdue`, 'Please finish or extend your session so the board stays correct.');
      }
    }
    for (const b of bookings) {
      if (b.userId !== profile.uid || b.status !== 'booked') continue;
      const start = toDate(b.start).getTime();
      if (start - t <= 10 * MIN && start - t > 0) once(`bk:${b.id}`, `Booking soon: ${b.instrumentName}`, `Starts at ${fmtTime(start)}.`);
      if (t >= start && t < start + 30 * MIN) once(`bkstart:${b.id}`, `Your ${b.instrumentName} booking has started`, `Start the session by ${fmtTime(start + 30 * MIN)} or it is released.`);
    }
  }, [now, activeSessions, bookings, profile, toast]);
}
