// ============================================================
// VERSJON – Bump denne ved hver deploy for å tvinge oppdatering
// ============================================================
const APP_VERSION = '1.0.1';
const CACHE_NAME  = `strawberry-plan-v${APP_VERSION}`;

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './firestore.js',
  './firebase-config.js',
  './manifest.json',
  './Strawberry_Logotype_Primary_Black_RGB.png',
  './Strawberry_Logotype_Primary_White_RGB.png'
];

// Install: cache filer, men IKKE skipWaiting – vent på manuell aktivering
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

// Activate: slett gamle cacher
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Motta melding fra app (f.eks. "SKIP_WAITING" fra oppdateringsknappen)
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('firestore.googleapis.com') ||
      event.request.url.includes('firebase') ||
      event.request.url.includes('googleapis.com')) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      });
    }).catch(() => caches.match('./index.html'))
  );
});
