/**
 * sw.js — Production Service Worker for Medical365 HMS (PWA v3)
 *
 * Caching Strategy:
 *   Navigation (HTML)          → Network-First (ensures fresh JS chunk hashes when online; falls back to cached index.html when offline)
 *   App Shell & Static Assets  → Cache-First (JS, CSS, images, fonts with strict MIME validation)
 *   API calls (/api/*)         → Network-First / Direct (IndexedDB handles data caching in-app)
 *   Google Fonts & CDNs        → Stale-While-Revalidate
 *
 * The SW guarantees:
 *   - Offline PWA opens and functions seamlessly.
 *   - Outdated HTML or missing JS chunks NEVER get cached as valid JavaScript.
 *   - Old caches are automatically purged upon activation.
 */

const CACHE_NAME = 'hms-shell-v3';
const STATIC_CACHE = 'hms-static-v3';
const FONT_CACHE = 'hms-fonts-v3';

// App shell files to precache on install
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png',
];

// ── INSTALL ───────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[Service Worker v3] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL).catch((err) => {
        console.warn('[SW] Precache non-blocking warning:', err);
      });
    })
  );
  self.skipWaiting();
});

// ── ACTIVATE ──────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[Service Worker v3] Activating & cleaning stale caches...');
  const currentCaches = [CACHE_NAME, STATIC_CACHE, FONT_CACHE];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (!currentCaches.includes(name)) {
            console.log('[SW] Purging stale cache:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// ── FETCH ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip non-http(s) schemes (e.g. chrome-extension://)
  if (!url.protocol.startsWith('http')) return;

  // Skip Vite dev server modules and HMR
  if (
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/@') ||
    url.pathname.startsWith('/node_modules/') ||
    url.search.includes('token=')
  ) {
    return;
  }

  // ── API calls: Bypass SW completely (Axios + IndexedDB handles offline queueing) ──
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // ── Navigation requests (HTML / SPA routes): Network-First with Offline fallback ──
  if (request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put('/index.html', responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match('/index.html').then((cachedIndex) => {
            return cachedIndex || new Response('Offline - Medical365', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: { 'Content-Type': 'text/html' }
            });
          });
        })
    );
    return;
  }

  // ── Google Fonts: Stale-While-Revalidate ──
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.open(FONT_CACHE).then((cache) => {
        return cache.match(request).then((cached) => {
          const fetched = fetch(request)
            .then((response) => {
              if (response.ok) {
                cache.put(request, response.clone());
              }
              return response;
            })
            .catch(() => cached);
          return cached || fetched;
        });
      })
    );
    return;
  }

  // ── CDN/External assets: Stale-While-Revalidate ──
  if (url.hostname.includes('cdnjs.cloudflare.com') || url.hostname.includes('cdn.tailwindcss.com')) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) => {
        return cache.match(request).then((cached) => {
          const fetched = fetch(request)
            .then((response) => {
              if (response.ok) {
                cache.put(request, response.clone());
              }
              return response;
            })
            .catch(() => cached);
          return cached || fetched;
        });
      })
    );
    return;
  }

  // ── Static assets (/assets/*.js, /assets/*.css, images, manifest): Cache-First ──
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        // Guard against corrupted cache entries (e.g. HTML stored for a .js URL)
        const cachedType = (cached.headers.get('content-type') || '').toLowerCase();
        const isScriptOrStyle = url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.includes('/assets/');
        if (isScriptOrStyle && cachedType.includes('text/html')) {
          caches.open(STATIC_CACHE).then((cache) => cache.delete(request));
        } else {
          return cached;
        }
      }

      return fetch(request)
        .then((response) => {
          if (response && response.status === 200 && shouldCacheResponse(url, response)) {
            const responseClone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // If offline and requesting a static asset not in cache
          return new Response('Asset Unavailable Offline', {
            status: 503,
            statusText: 'Service Unavailable'
          });
        });
    })
  );
});

/**
 * Determine if a response should be cached as a static asset.
 * NEVER cache HTML responses under asset URLs.
 */
function shouldCacheResponse(url, response) {
  if (url.origin !== self.location.origin) return false;
  if (!response || response.status !== 200) return false;

  const contentType = (response.headers.get('content-type') || '').toLowerCase();

  // STRICT GUARD: NEVER cache HTML as a static asset
  if (contentType.includes('text/html')) {
    return false;
  }

  if (
    contentType.includes('javascript') ||
    contentType.includes('application/javascript') ||
    contentType.includes('text/javascript') ||
    contentType.includes('text/css') ||
    contentType.includes('image/') ||
    contentType.includes('font/') ||
    contentType.includes('application/json') ||
    contentType.includes('application/manifest+json')
  ) {
    return true;
  }

  if (url.pathname.startsWith('/assets/') && (contentType.includes('javascript') || contentType.includes('css'))) {
    return true;
  }

  return false;
}