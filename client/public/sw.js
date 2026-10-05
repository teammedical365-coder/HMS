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

const CACHE_NAME = 'hms-shell-v4';
const STATIC_CACHE = 'hms-static-v4';
const FONT_CACHE = 'hms-fonts-v4';

const hostname = self.location.hostname;
const port = self.location.port;
const isLocalDev =
  hostname === 'localhost' ||
  hostname.endsWith('.localhost') ||
  hostname === '127.0.0.1' ||
  hostname.endsWith('.test') ||
  hostname.endsWith('.local') ||
  port === '5173' ||
  port === '5174' ||
  port === '3000';

if (isLocalDev) {
  // In development environments (including tenant subdomains like *.localhost:5173),
  // immediately unregister this service worker and clear all caches.
  self.addEventListener('install', () => {
    self.skipWaiting();
  });

  self.addEventListener('activate', (event) => {
    event.waitUntil(
      caches.keys()
        .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
        .then(() => self.registration.unregister())
        .then(() => self.clients.claim())
        .then(() => console.log('[SW] Service worker auto-unregistered in local dev'))
    );
  });

  self.addEventListener('fetch', () => {
    // In dev mode, NEVER intercept any request. Let browser fetch directly from Vite.
    return;
  });
} else {
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
    console.log('[Service Worker v4] Installing...');
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
    console.log('[Service Worker v4] Activating & cleaning stale caches...');
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
      url.search.includes('token=') ||
      url.search.includes('import') ||
      url.pathname.endsWith('.jsx') ||
      url.pathname.endsWith('.tsx') ||
      url.pathname.endsWith('.ts')
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
              return cachedIndex || new Response(
                '<!DOCTYPE html><html lang="en"><head><title>Offline - Medical365</title></head><body style="font-family:sans-serif;text-align:center;padding:50px;"><h2>Offline - Medical365</h2><p>Please check your internet connection.</p></body></html>',
                {
                  status: 200,
                  headers: { 'Content-Type': 'text/html' }
                }
              );
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
            // Never return plain text / 503 error strings for JS assets, as that throws Uncaught SyntaxError in module loaders
            if (url.pathname.endsWith('.js') || (request.headers.get('accept') || '').includes('application/javascript')) {
              return new Response('/* Offline: module unavailable */', {
                status: 200,
                headers: { 'Content-Type': 'application/javascript' }
              });
            }
            return Response.error();
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
}