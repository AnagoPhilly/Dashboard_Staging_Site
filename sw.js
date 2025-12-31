// sw.js - Service Worker

// 1. Name of our cache
const CACHE_NAME = 'cleandash-v1';

// 2. Files to save for offline use
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/manifest.json',
  '/icons/icon-192.png'
];

// 3. Install Event: Cache files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Service Worker: Caching files');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// 4. Fetch Event: Serve from cache if offline
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});