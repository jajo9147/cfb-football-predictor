// ==========================================================================
// GRIDIRON ORACLE SERVICE WORKER (REAL-TIME NETWORK-FIRST ENGINE)
// ==========================================================================

const CACHE_NAME = 'gridiron-oracle-v2026.69';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Network-First Strategy: Always fetch fresh code
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request, { cache: 'no-store' })
      .catch(() => caches.match(event.request))
  );
});
