// ==========================================================================
// CFB PROPHET PWA SERVICE WORKER (Network-First with Offline Fallback)
// ==========================================================================

const CACHE_NAME = 'cfb-prophet-cache-v20260827-v287';
const OFFLINE_URL = './index.html';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './data/teams.js',
  './data/teams_v3.js',
  './qrious.min.js',
  './qrcode.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/screenshot-desktop.jpg',
  './icons/screenshot-mobile.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(() => {});
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME) {
            return caches.delete(k);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Network-First Strategy with offline fallback
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Bypass cloud relay / external APIs to avoid caching dynamic live submissions
  if (url.hostname.includes('ntfy.sh') || url.hostname.includes('google.com')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && event.request.url.startsWith(self.location.origin)) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (event.request.mode === 'navigate') {
            return caches.match(OFFLINE_URL);
          }
          return new Response('Offline', { status: 503, statusText: 'Offline' });
        });
      })
  );
});

// Background Sync capability
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-community-brackets') {
    event.waitUntil(Promise.resolve());
  }
});

// Periodic Background Sync capability
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'update-cfb-rankings') {
    event.waitUntil(Promise.resolve());
  }
});

// Push Notifications capability
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.text() : 'CFB Prophet Game Update';
  event.waitUntil(
    self.registration.showNotification('CFB Prophet', {
      body: data,
      icon: 'https://jajo9147.github.io/cfb-football-predictor/icons/icon-192.png',
      badge: 'https://jajo9147.github.io/cfb-football-predictor/icons/icon-192.png'
    })
  );
});
