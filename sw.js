/* ── JB Finance Service Worker v2.0 ── */
const CACHE_NAME = 'jbfinance-v2';

/* All external CDN scripts the app needs */
const CDN_URLS = [
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://unpkg.com/react@18/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
  'https://unpkg.com/@babel/standalone/babel.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap'
];

/* App shell — local files served from GitHub Pages */
const APP_SHELL = [
  '/jbfinance-/',
  '/jbfinance-/index.html',
  '/jbfinance-/manifest.json'
];

/* ── INSTALL: pre-cache everything ── */
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      /* Cache app shell */
      await cache.addAll(APP_SHELL).catch(() => {});

      /* Cache CDN resources individually (don't fail install if one CDN is slow) */
      for (const url of CDN_URLS) {
        try {
          const response = await fetch(url, { mode: 'cors' });
          if (response.ok) {
            await cache.put(url, response);
          }
        } catch (e) {
          console.warn('[SW] Could not pre-cache:', url, e.message);
        }
      }
    })
  );
});

/* ── ACTIVATE: clear old caches ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

/* ── FETCH: Cache-first for CDN + app shell, Network-first for Supabase API ── */
self.addEventListener('fetch', event => {
  const url = event.request.url;

  /* Skip non-GET and chrome-extension requests */
  if (event.request.method !== 'GET') return;
  if (url.startsWith('chrome-extension://')) return;

  /* Supabase API calls — always go to network (live data) */
  if (url.includes('supabase.co')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ error: 'Offline — no network' }), {
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  /* Google Fonts API — network first, fall back to cache */
  if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  /* CDN scripts + app shell — cache first, fallback to network */
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        /* If it's a navigation request and we're offline, serve the app shell */
        if (event.request.mode === 'navigate') {
          return caches.match('/jbfinance-/index.html');
        }
      });
    })
  );
});
