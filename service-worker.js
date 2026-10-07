const CACHE_NAME = 'evergreen-v5-shell-v16';
const APP_SHELL = [
  './',
  './index.html',
  './css/app.css?v=sidebar-1',
  './js/app.js',
  './js/core/state.js',
  './js/core/storage.js?v=receipt-storage-1',
  './js/core/ledger.js',
  './js/core/customers.js',
  './js/core/suppliers.js',
  './js/core/payments.js?v=invoice-branding-1',
  './js/core/banking.js?v=reconciliation-safety-1',
  './js/core/receipts.js?v=receipt-storage-1',
  './js/core/reports.js',
  './js/ui/reports.js',
  './manifest.json',
  './assets/evergreen-icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') return response;
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      });
    })
  );
});
