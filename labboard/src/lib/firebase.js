import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, connectAuthEmulator } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache, connectFirestoreEmulator } from 'firebase/firestore';

const envConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// On Firebase Hosting the web config is served at /__/firebase/init.json (the website's own dashboard uses
// the same source), so nothing has to be configured or committed. VITE_FIREBASE_* variables win when set,
// which is how local development and the emulators work.
const CONFIG_KEY = 'labboard-fb-config';
async function fetchHosted() {
  const res = await fetch('/__/firebase/init.json', { cache: 'no-cache' });
  if (!res.ok) return null;
  const hosted = await res.json();
  return hosted.apiKey && hosted.projectId ? hosted : null;
}
async function loadConfig() {
  if (envConfig.apiKey && envConfig.projectId) return envConfig;
  // Start instantly from the copy saved on the last visit (the web config almost never changes) and
  // refresh it in the background; only the very first visit waits for the network.
  try {
    const cached = JSON.parse(localStorage.getItem(CONFIG_KEY) || 'null');
    if (cached?.apiKey && cached?.projectId) {
      fetchHosted()
        .then((c) => c && localStorage.setItem(CONFIG_KEY, JSON.stringify(c)))
        .catch(() => {});
      return cached;
    }
  } catch {
    /* storage blocked */
  }
  try {
    const hosted = await fetchHosted();
    if (hosted) {
      try {
        localStorage.setItem(CONFIG_KEY, JSON.stringify(hosted));
      } catch {
        /* storage blocked */
      }
      return hosted;
    }
  } catch {
    /* not on Firebase Hosting */
  }
  return envConfig;
}
const firebaseConfig = await loadConfig();

// Local development against the Firebase emulators: set VITE_USE_EMULATORS=true
export const USE_EMULATORS = import.meta.env.VITE_USE_EMULATORS === 'true';
if (USE_EMULATORS) {
  firebaseConfig.apiKey ||= 'demo-key';
  firebaseConfig.projectId ||= 'demo-labboard';
  firebaseConfig.authDomain ||= 'localhost';
  firebaseConfig.appId ||= 'demo-app';
}

export const firebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

export const app = initializeApp(firebaseConfigured ? firebaseConfig : { apiKey: 'missing', projectId: 'missing', appId: 'missing' });
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Offline cache: the board keeps working through short Wi-Fi drops and
// re-opening the app costs fewer billed reads.
export const db = initializeFirestore(app, {
  localCache: USE_EMULATORS ? memoryLocalCache() : persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

if (USE_EMULATORS) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}

export const ALLOWED_DOMAIN = import.meta.env.VITE_ALLOWED_DOMAIN || '';
