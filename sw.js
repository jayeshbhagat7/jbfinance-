/* ── JB Finance Service Worker v1.9 ──────────────────────────────────
   Strategy:
   - App shell (index.html) → Cache First, background update
   - CDN scripts (React, Babel, Supabase, pdf.js, Chart.js) → Cache First
   - Google Fonts → Cache First (stale-while-revalidate)
   - Supabase API → Network First (always fresh data)
   - Everything else → Network First with cache fallback
   ─────────────────────────────────────────────────────────────────── */

const CACHE_NAME    = 'jbf-v1.9';
const OFFLINE_PAGE  = '/jbfinance-/index.html';
const BASE_PATH     = '/jbfinance-';

/* CDN assets to pre-cache on SW install */
const PRECACHE = [
  '/jbfinance-/',
  '/jbfinance-/index.html',
  '/jbfinance-/sw.js',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://unpkg.com/react@18/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
  'https://unpkg.com/@babel/standalone/babel.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap',
];

/* Hosts that must always go network-first (live data) */
const NETWORK_FIRST_HOSTS = [
  'supabase.co',
  'supabase.com',
];

/* ── Install: pre-cache app shell + CDN assets ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      /* Cache each asset individually so one failure doesn't block all */
      await Promise.allSettled(
        PRECACHE.map(url =>
          cache.add(url).catch(err =>
            console.warn('[SW] Pre-cache failed for', url, err)
          )
        )
      );
    }).then(() => self.skipWaiting())
  );
});

/* ── Activate: delete old caches ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => { console.log('[SW] Deleting old cache:', k); return caches.delete(k); })
      )
    ).then(() => self.clients.claim())
  );
});

/* ── Fetch: routing logic ── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  /* Skip non-GET and chrome-extension requests */
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  /* Supabase API — always Network First, no caching */
  if (NETWORK_FIRST_HOSTS.some(h => url.hostname.includes(h))) {
    event.respondWith(networkFirst(request, false));
    return;
  }

  /* App shell (index.html or root path) — Cache First + background update */
  if (url.pathname === BASE_PATH+'/' || url.pathname === BASE_PATH+'/index.html' || url.pathname === BASE_PATH) {
    event.respondWith(cacheFirstWithUpdate(request));
    return;
  }

  /* CDN scripts — Cache First (they're versioned, safe to cache long-term) */
  if (
    url.hostname.includes('cdn.jsdelivr.net') ||
    url.hostname.includes('unpkg.com') ||
    url.hostname.includes('cdnjs.cloudflare.com')
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  /* Google Fonts — Cache First */
  if (
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  /* Everything else — Network First with cache fallback */
  event.respondWith(networkFirst(request, true));
});

/* ── Strategy: Cache First ── */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline — resource not cached', { status: 503 });
  }
}

/* ── Strategy: Cache First + background update (app shell) ── */
async function cacheFirstWithUpdate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  /* Kick off background fetch to update cache silently */
  const fetchPromise = fetch(request).then(response => {
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => null);

  /* Return cached immediately if available, else wait for network */
  return cached || fetchPromise || new Response('Offline', { status: 503 });
}

/* ── Strategy: Network First with optional cache fallback ── */
async function networkFirst(request, useCacheFallback) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200 && useCacheFallback) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    if (useCacheFallback) {
      const cached = await caches.match(request);
      if (cached) return cached;
      /* Final fallback: return app shell so app at least loads */
      const shell = await caches.match(OFFLINE_PAGE);
      if (shell) return shell;
    }
    return new Response('Offline', { status: 503 });
  }
}
