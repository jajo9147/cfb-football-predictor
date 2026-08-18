// ==========================================================================
// GRIDIRON ORACLE SERVICE WORKER (CACHE & OFFLINE ENGINE)
// ==========================================================================

const CACHE_NAME = 'gridiron-oracle-v2026.1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css?v=2026.1',
  './app.js?v=2026.1',
  './data/teams.js?v=2026.1',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request);
    })
  );
});
