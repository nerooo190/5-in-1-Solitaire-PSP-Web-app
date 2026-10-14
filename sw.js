/* Offline cache: the whole app is ~100 KB of static files. */
const CACHE = 'solitaire5in1-v2';
const FILES = ['./', 'index.html', 'css/style.css', 'js/util.js', 'js/audio.js', 'js/gfx.js', 'js/table.js', 'js/games.js', 'js/ui.js', 'js/main.js', 'icon.svg', 'manifest.webmanifest', 'psp.html'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) =>
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
);
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});
