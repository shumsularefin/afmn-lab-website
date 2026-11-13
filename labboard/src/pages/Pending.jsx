import { useAuth } from '../contexts/AuthContext';
import { Avatar, Button } from '../components/ui';

export default function Pending() {
  const { profile, user, signOut } = useAuth();
  return (
    <div className="wallpaper flex min-h-[100dvh] items-center justify-center px-5">
      <div className="vibrancy w-full max-w-md animate-zoom-in rounded-[28px] p-8 text-center shadow-window ring-1 ring-white/40 dark:shadow-window-dark dark:ring-white/10">
        <Avatar src={user?.photoURL} name={user?.displayName} size="h-20 w-20" className="mx-auto" />
        <h1 className="mt-4 text-xl font-bold text-slate-900 dark:text-white">Waiting for approval</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          You're signed in as <b>{profile?.email || user?.email}</b>, but this account isn't on the lab's approved list yet.
          Ask a LabBoard admin to approve you — this page updates automatically as soon as they do.
        </p>
        <Button variant="secondary" className="mt-6" onClick={signOut}>Sign out / use another account</Button>
      </div>
    </div>
  );
}
