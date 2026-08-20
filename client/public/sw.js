// client/public/sw.js
self.addEventListener('install', (e) => {
    console.log('[Service Worker] Installed');
});

// Chrome requires a fetch event listener to show the Install prompt!
self.addEventListener('fetch', (e) => {
    // Abhi ke liye hum sab kuch normal chalne denge
    return;
});