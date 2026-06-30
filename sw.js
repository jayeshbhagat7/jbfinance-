/* ── JB Finance Service Worker v2.0 ── */
const CACHE_NAME   = 'jbf-v2';
const STATIC_CACHE = 'jbf-static-v2';

/* Assets to cache on install (app shell) */
const PRECACHE_URLS = [
  '/jbfinance-/',
  '/jbfinance-/index.html',
  /* CDN assets — cached on first fetch via runtime caching */
];

/* CDN origins to cache aggressively (fonts, chart.js, react, etc.) */
const CDN_ORIGINS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.jsdelivr.net',
  'unpkg.com',
  'cdnjs.cloudflare.com',
];

/* Supabase origin — never serve from cache (always fresh) */
const SUPABASE_ORIGIN = 'supabase.co';

/* ── INSTALL: pre-cache app shell ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_URLS).catch(err => {
        console.warn('[SW] Pre-cache partial failure (ok on localhost):', err);
      });
    }).then(() => self.skipWaiting())
  );
});

/* ── ACTIVATE: clean old caches ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== STATIC_CACHE)
          .map(k => { console.log('[SW] Deleting old cache:', k); return caches.delete(k); })
      )
    ).then(() => {
      self.clients.claim();
      /* Notify all clients that a new SW is active */
      self.clients.matchAll().then(clients =>
        clients.forEach(c => c.postMessage({ type: 'SW_UPDATED' }))
      );
    })
  );
});

/* ── FETCH: routing strategy ── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  /* 1. Skip non-GET and chrome-extension requests */
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  /* 2. Supabase API → Network-only (never cache DB calls) */
  if (url.hostname.includes(SUPABASE_ORIGIN)) return;

  /* 3. CDN assets (fonts, libraries) → Cache-first, fallback network */
  if (CDN_ORIGINS.some(o => url.hostname.includes(o))) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  /* 4. Same-origin app shell (index.html, sw.js, manifest.json, icons)
        → Network-first with cache fallback (ensures updates land) */
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request, CACHE_NAME));
    return;
  }

  /* 5. Everything else → network (Cloudflare beacon etc.) */
});

/* ── STRATEGY: Cache-first ── */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return cached || new Response('Offline', { status: 503 });
  }
}

/* ── STRATEGY: Network-first with cache fallback ── */
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    /* If navigating and offline, serve index.html as fallback */
    if (request.mode === 'navigate') {
      const fallback = await caches.match('/jbfinance-/index.html')
                    || await caches.match('/jbfinance-/');
      if (fallback) return fallback;
    }
    return new Response(
      '<h2 style="font-family:monospace;padding:24px">📵 JB Finance — Offline<br><small>You can still add entries; they will sync when back online.</small></h2>',
      { status: 503, headers: { 'Content-Type': 'text/html' } }
    );
  }
}

/* ── MESSAGE: manual skipWaiting from app ── */
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
