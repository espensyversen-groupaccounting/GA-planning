// ============================================================
// VERSJON – Bump denne ved hver deploy for å tvinge oppdatering
// ============================================================
const APP_VERSION = '1.3.1';
const CACHE_NAME  = `strawberry-plan-v${APP_VERSION}`;

const APP_FILES = [
  './index.html',
  './styles.css',
  './app.js',
  './firestore.js',
  './firebase-config.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-180.png',
  './Strawberry_Logotype_Primary_Black_RGB.png',
  './Strawberry_Logotype_Primary_White_RGB.png'
];

// Install: cache filer OG ta over med en gang (skipWaiting)
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting()) // Ta over umiddelbart – ingen venting
  );
});

// Activate: slett ALLE gamle cacher og ta kontroll over alle klienter
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim()) // Ta kontroll over åpne faner
  );
});

// Motta melding fra app
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch: network-first for app-filer (alltid hent fersk versjon om mulig)
// Faller tilbake på cache hvis offline
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  // Firebase/Google – aldri cache, alltid nettverk
  if (event.request.url.includes('firestore.googleapis.com') ||
      event.request.url.includes('identitytoolkit') ||
      event.request.url.includes('firebase') ||
      event.request.url.includes('googleapis.com') ||
      event.request.url.includes('gstatic.com')) return;

  // Navigasjon til app-root må også være network-first. På custom domain
  // slutter URL-en ofte ikke med /index.html, så den må håndteres eksplisitt.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put('./index.html', clone));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // App-filer: network-first
  const isAppFile = APP_FILES.some(f =>
    event.request.url.endsWith(f.replace('./', '/')) ||
    event.request.url.includes('/GA-planning/')
  );

  if (isAppFile) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Oppdater cache med fersk versjon
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request)) // Offline: bruk cache
    );
  }
});
