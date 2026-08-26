// Service Worker for Sangeetham AI Music Player PWA
const CACHE_NAME = 'sangeetham-v3.0';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/style.css',
  './css/icons.min.css',
  './font-awesome/css/all.min.css',
  './font-awesome/css/v4-shims.min.css',
  './font-awesome/css/font-awesome.min.css',
  './javascript/audio_player.js',
  './javascript/ai_chat.js',
  './javascript/crypto-js.min.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

// Install Event - Cache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[PWA SW] Pre-caching offline app shell');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - Clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[PWA SW] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Network first with Cache fallback for APIs, Cache first for static assets
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // For API or stream requests, use Network First strategy
  if (requestUrl.hostname.includes('saavn') || requestUrl.hostname.includes('onrender') || requestUrl.pathname.includes('/api')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match(event.request);
      })
    );
    return;
  }

  // Cache First strategy for local app assets
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Asynchronously update cache in background
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
        return networkResponse;
      });
    })
  );
});
