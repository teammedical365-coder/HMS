/**
 * sw.js — Production Service Worker for Medical365 HMS (PWA)
 *
 * Caching Strategy:
 *   App Shell (HTML, CSS, JS)  → Cache-First (precached on install)
 *   API calls (/api/*)         → Network-First (IndexedDB handles data caching in-app)
 *   Static assets (images)     → Cache-First with 30-day expiry
 *   Google Fonts               → Stale-While-Revalidate
 *
 * The SW's job is ONLY to cache the app shell so the PWA opens when offline.
 * All data-level caching is handled by the IndexedDB layer in the React app.
 */

const CACHE_NAME = 'hms-shell-v2';
const STATIC_CACHE = 'hms-static-v2';
const FONT_CACHE = 'hms-fonts-v2';

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
  console.log('[Service Worker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL).catch((err) => {
        console.warn('[SW] Some shell files failed to cache:', err);
      });
    })
  );
  // Activate immediately without waiting for old SW to finish
  self.skipWaiting();
});

// ── ACTIVATE ──────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  // Clean up old caches
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME && name !== STATIC_CACHE && name !== FONT_CACHE) {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          }
        })
      );
    })
  );
  // Take control of all open tabs immediately
  self.clients.claim();
});

// ── FETCH ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests (POST, PUT, etc. should go to network)
  if (request.method !== 'GET') return;

  // Skip chrome-extension, dev server HMR, and other non-http(s) schemes
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

  // ── API calls: Network-only (data caching is handled by IndexedDB in-app) ──
  if (url.pathname.startsWith('/api/')) {
    // Don't intercept API calls — let the Axios offline interceptor handle them
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

  // ── App Shell & Static assets: Cache-First ──
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          // Cache successful responses for static assets
          if (response.ok && shouldCacheResponse(url, response)) {
            const responseClone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // For navigation requests, return the cached index.html (SPA fallback)
          if (request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
        });
    })
  );
});

/**
 * Determine if a response should be cached as a static asset
 */
function shouldCacheResponse(url, response) {
  // Only cache same-origin responses
  if (url.origin !== self.location.origin) return false;

  // Cache JS, CSS, and image files
  const contentType = response.headers.get('content-type') || '';
  if (
    contentType.includes('javascript') ||
    contentType.includes('text/css') ||
    contentType.includes('image/') ||
    contentType.includes('font/')
  ) {
    return true;
  }

  // Cache files in /assets/ directory (Vite build output)
  if (url.pathname.startsWith('/assets/')) return true;

  return false;
}