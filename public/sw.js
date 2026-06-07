// Nama cache kita
const CACHE_NAME = 'sigma-app-v1';

// Saat aplikasi pertama kali di-install di HP
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Terpasang di HP.');
  self.skipWaiting();
});

// Saat aplikasi dibuka
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Aktif dan siap melayani.');
  return self.clients.claim();
});

// Strategi: Tarik data dari Internet, kalau offline jangan sampai aplikasi blank
self.addEventListener('fetch', (event) => {
  // Hanya proses permintaan dari web kita sendiri
  if (event.request.url.startsWith(self.location.origin)) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match(event.request);
      })
    );
  }
});