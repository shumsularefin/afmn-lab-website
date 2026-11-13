import { createContext, useContext, useEffect, useState } from 'react';
import { GoogleAuthProvider, onAuthStateChanged, signInWithCredential, signInWithPopup, signInWithRedirect, signOut as fbSignOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db, googleProvider, ALLOWED_DOMAIN } from '../lib/firebase';
import { ensureUserProfile } from '../lib/data';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let unsubProfile = () => {};
    const unsub = onAuthStateChanged(auth, async (u) => {
      unsubProfile();
      setProfile(null);
      setUser(u);
      if (!u) return;
      try {
        await ensureUserProfile(u, ALLOWED_DOMAIN);
      } catch (e) {
        console.error(e);
        setError(e);
      }
      unsubProfile = onSnapshot(
        doc(db, 'users', u.uid),
        (s) => setProfile(s.exists() ? { id: s.id, ...s.data() } : { uid: u.uid, email: u.email, approved: false, role: 'guest', missing: true }),
        (e) => setError(e),
      );
    });
    return () => {
      unsub();
      unsubProfile();
    };
  }, []);

  async function signIn() {
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
        await signInWithRedirect(auth, googleProvider);
      } else if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
        setError(e);
      }
    }
  }

  // Emulator only: sign in as any fake Google account without a popup.
  async function devSignIn(email, name) {
    const cred = GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, email_verified: true, name }));
    await signInWithCredential(auth, cred);
  }

  const value = {
    devSignIn,
    user,
    profile,
    error,
    loading: user === undefined || (user && !profile),
    isApproved: Boolean(profile?.approved),
    isMember: Boolean(profile?.approved && ['member', 'admin'].includes(profile.role)),
    isAdmin: Boolean(profile?.approved && profile.role === 'admin'),
    signIn,
    signOut: () => fbSignOut(auth),
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
