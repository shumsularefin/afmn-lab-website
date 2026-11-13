import { useEffect, useState } from 'react';

/** Small "Install LabBoard" chip shown when the browser offers PWA install. */
export function InstallPrompt() {
  const [evt, setEvt] = useState(null);
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem('labboard-install-dismissed') === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    const h = (e) => {
      e.preventDefault();
      setEvt(e);
    };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);
  if (!evt || hidden) return null;
  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem('labboard-install-dismissed', '1');
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="fixed bottom-24 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full bg-slate-900 py-1.5 pl-4 pr-1.5 text-sm text-white shadow-lg dark:bg-slate-700 lg:bottom-6">
      Install LabBoard as an app
      <button
        className="rounded-full bg-indigo-500 px-3 py-1 font-semibold"
        onClick={async () => {
          evt.prompt();
          await evt.userChoice;
          setEvt(null);
        }}
      >
        Install
      </button>
      <button className="px-2 text-slate-300" onClick={dismiss} aria-label="Dismiss">✕</button>
    </div>
  );
}
