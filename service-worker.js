const CACHE_NAME = 'evergreen-v5-shell-v27';
const APP_SHELL = [
  './',
  './index.html',
  './css/app.css?v=ocr-mobile-1',
  './js/app.js',
  './assets/vendor/utilities.css?v=cash-ledger-1',
  './assets/vendor/inter-5.2.5.css',
  './assets/vendor/icons-6.4.0.css',
  './assets/vendor/chart-4.4.8.umd.js',
  './js/core/state.js',
  './js/core/integrity.js?v=reliability-2',
  './js/core/storage.js?v=receipt-storage-1',
  './js/core/ledger.js?v=cash-ledger-1',
  './js/core/customers.js',
  './js/core/suppliers.js',
  './js/core/payments.js?v=invoice-branding-1',
  './js/core/banking.js?v=cash-ledger-1',
  './js/core/receipts.js?v=receipt-automation-2',
  './js/core/receipt-ocr.js?v=ocr-review-3',
  './js/ui/receipt-ocr.js?v=ocr-review-3',
  './js/core/bank-entries.js?v=cash-ledger-1',
  './js/ui/bank-workflows.js?v=bank-workflows-1',
  './js/core/reports.js?v=cash-ledger-1',
  './js/ui/reports.js',
  './js/core/cash.js?v=cash-ledger-1',
  './js/ui/cash.js?v=cash-ledger-1',
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
        keys.filter((key) => key.startsWith('evergreen-v5-shell-') && key !== CACHE_NAME).map((key) => caches.delete(key))
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
          if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) throw new Error('Application page unavailable');
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

