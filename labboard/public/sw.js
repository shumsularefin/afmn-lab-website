// LabBoard service worker: makes the app installable and loads the shell offline. It only controls
// /update (its own scope), so the rest of the website is never touched. The scope is "/update" without a
// trailing slash because Firebase Hosting serves the app at /update (it redirects /update/ there). Firestore data has its own
// offline cache (IndexedDB) in the app.
const CACHE = 'labboard-v2';
const BASE = new URL('./', self.location).href; // https://afmn-lab.web.app/update/ (this file's folder)
const ROOT = new URL(BASE).pathname; // /update/
const inScope = (path) => path === ROOT.slice(0, -1) || path.startsWith(ROOT);
const SHELL = ['', 'index.html', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png'].map((p) => BASE + p);

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never touch Firebase/Google traffic
  if (!inScope(url.pathname)) return;

  // Navigations: network first, fall back to the cached shell (single-page app).
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(BASE + 'index.html', copy));
          return res;
        })
        .catch(() => caches.match(BASE + 'index.html')),
    );
    return;
  }

  // Hashed build assets & icons: cache first.
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && (url.pathname.startsWith(ROOT + 'assets/') || url.pathname.startsWith(ROOT + 'icons/'))) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const existing = list.find((c) => 'focus' in c);
      if (existing) {
        existing.navigate(BASE + 'my');
        return existing.focus();
      }
      return self.clients.openWindow(BASE + 'my');
    }),
  );
});
