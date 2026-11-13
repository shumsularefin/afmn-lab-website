import { useAuth } from '../contexts/AuthContext';
import { asset } from '../lib/paths';
import { firebaseConfigured, ALLOWED_DOMAIN, USE_EMULATORS } from '../lib/firebase';
import { friendlyError } from '../contexts/ToastContext';

export default function Login() {
  const { signIn, devSignIn, error } = useAuth();
  return (
    <div className="bg-slate-50 dark:bg-slate-950 relative flex min-h-[100dvh] flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-[380px] animate-zoom-in">
        <div className="rounded-3xl bg-white p-8 text-center shadow-card ring-1 ring-black/[0.06] dark:bg-[#1c1c1e] dark:ring-white/10">
          <img src={asset('icons/icon.svg')} alt="" className="mx-auto h-20 w-20 drop-shadow-[0_8px_16px_rgba(0,0,0,.25)]" />
          <h1 className="mt-5 text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">LabBoard</h1>
          <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">AFMN Lab · instrument board</p>
          <p className="mt-4 text-[15px] leading-relaxed text-slate-600 dark:text-slate-300 lg:text-[15px]">See what's free, start a session in 20 seconds, and never guess who's using the instrument.</p>
          {!firebaseConfigured ? (
            <div className="mt-6 rounded-xl bg-amber-50 p-4 text-left text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
              Firebase is not configured. Copy <code>.env.example</code> to <code>.env.local</code>, fill in your web-app config and restart <code>npm run dev</code>.
            </div>
          ) : (
            <button
              onClick={signIn}
              className="mt-7 flex h-12 w-full items-center justify-center gap-3 rounded-full bg-white text-[15px] font-semibold text-slate-900 shadow-[0_1px_3px_rgba(0,0,0,.15),0_0_0_0.5px_rgba(0,0,0,.08)] transition hover:bg-slate-50 active:scale-[0.98] dark:bg-white/15 dark:text-white dark:hover:bg-white/20 lg:h-11"
            >
              <svg className="h-5 w-5" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
                <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
              </svg>
              Continue with Google
            </button>
          )}
          {USE_EMULATORS && <DevLogin onLogin={devSignIn} />}
          {error && <p className="mt-4 text-sm text-rose-600">{friendlyError(error)}</p>}
        </div>
        <p className="mt-5 text-center text-xs font-medium text-slate-700/80 dark:text-white/60">
          Only approved lab members can enter{ALLOWED_DOMAIN ? <> (or anyone with an @{ALLOWED_DOMAIN} account)</> : null}.
        </p>
      </div>
    </div>
  );
}

function DevLogin({ onLogin }) {
  const go = (e) => {
    e.preventDefault();
    const email = e.target.email.value.trim();
    if (email) onLogin(email, e.target.name.value.trim() || email.split('@')[0]);
  };
  return (
    <form onSubmit={go} className="mt-6 space-y-2 rounded-xl bg-black/[0.04] p-3 text-left text-xs dark:bg-white/[0.06]">
      <div className="font-semibold text-slate-600 dark:text-slate-300">Emulator sign-in (local dev only)</div>
      <input name="email" placeholder="email" className="w-full rounded-lg border px-2 py-1.5 text-sm text-slate-900" />
      <input name="name" placeholder="display name" className="w-full rounded-lg border px-2 py-1.5 text-sm text-slate-900" />
      <button className="w-full rounded-lg bg-slate-800 py-1.5 font-semibold text-white">Sign in</button>
    </form>
  );
}
