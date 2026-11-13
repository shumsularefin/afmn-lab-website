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
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto max-w-md rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${
              t.tone === 'error' ? 'bg-rose-600 text-white' : t.tone === 'success' ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-white dark:bg-slate-700'
            }`}
          >
            {t.message}
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
