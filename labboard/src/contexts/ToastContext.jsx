import { createContext, useCallback, useContext, useState } from 'react';

const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, tone = 'info', ms = 4000) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
  }, []);
  const api = {
    info: (m) => push(m, 'info'),
    success: (m) => push(m, 'success'),
    error: (m) => push(m instanceof Error ? friendlyError(m) : m, 'error', 6000),
  };
  return (
    <ToastCtx.Provider value={api}>
      {children}
      {/* Notification banners: top-right on desktop (Notification Center), top on phones (iOS). */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-3 pt-3 sm:items-end sm:px-5 sm:pt-16" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="vibrancy-strong pointer-events-auto flex w-full max-w-sm animate-slide-down items-start gap-3 rounded-2xl px-3.5 py-3 text-sm shadow-sheet ring-1 ring-black/5 dark:ring-white/10"
          >
            <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white ${t.tone === 'error' ? 'bg-rose-500' : t.tone === 'success' ? 'bg-emerald-500' : 'bg-indigo-600'}`}>
              {t.tone === 'error' ? '!' : t.tone === 'success' ? '✓' : 'i'}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-slate-900 dark:text-white">{t.tone === 'error' ? 'Something went wrong' : t.tone === 'success' ? 'Done' : 'LabBoard'}</div>
              <div className="text-slate-600 dark:text-slate-300">{t.message}</div>
            </div>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function friendlyError(e) {
  const msg = e?.message || String(e);
  if (e?.code === 'permission-denied' || /insufficient permissions/i.test(msg)) {
    return 'Not allowed: you may lack the role or training approval for this action.';
  }
  if (e?.code === 'unavailable') return 'You seem to be offline. The change will sync when you reconnect.';
  return msg.replace(/^FirebaseError:\s*/, '');
}

export const useToast = () => useContext(ToastCtx);
