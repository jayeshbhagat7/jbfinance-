// JB Finance Service Worker v2.1-PRO-SITE
// Background sync + offline caching

const CACHE_NAME = 'jbf-v2.1-pro-site';
const RUNTIME_CACHE = 'jbf-runtime-v2.1';

const PRECACHE_URLS = [
  '/jbfinance-/',
  '/jbfinance-/index.html',
  '/jbfinance-/manifest.json',
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://unpkg.com/react@18/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
  'https://unpkg.com/@babel/standalone/babel.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js'
];

// Install event
self.addEventListener('install', event => {
  console.log('[SW] Installing v2.1...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// Activate event
self.addEventListener('activate', event => {
  console.log('[SW] Activating v2.1...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - network-first with cache fallback
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip Supabase API calls from caching
  if (url.hostname.includes('supabase.co')) {
    return event.respondWith(fetch(request));
  }

  // Network-first strategy
  event.respondWith(
    fetch(request)
      .then(response => {
        // Cache successful responses
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(RUNTIME_CACHE).then(cache => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache on network failure
        return caches.match(request).then(cached => {
          if (cached) {
            console.log('[SW] Serving from cache:', request.url);
            return cached;
          }
          // Return offline page if available
          return caches.match('/jbfinance-/index.html');
        });
      })
  );
});

// Background Sync event - push queued transactions
self.addEventListener('sync', event => {
  console.log('[SW] Sync event triggered:', event.tag);
  
  if (event.tag === 'sync-txns') {
    event.waitUntil(syncTransactions());
  }
});

async function syncTransactions() {
  console.log('[SW] Starting background sync...');
  
  try {
    // Open IndexedDB and get queued items
    const db = await openIndexedDB();
    const items = await getAllFromStore(db, 'outbox');
    
    if (items.length === 0) {
      console.log('[SW] No items to sync');
      return;
    }

    console.log(`[SW] Found ${items.length} items to sync`);
    
    let synced = 0;
    for (const item of items) {
      try {
        // Attempt to push to Supabase
        const payload = { ...item };
        delete payload.id;
        delete payload._queued_at;
        
        const response = await fetch('https://ayzlaumbrntpqfemnxao.supabase.co/rest/v1/transactions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5emxhdW1icm50cHFmZW1ueGFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxNjQwNTAsImV4cCI6MjA4OTc0MDA1MH0.VEYId6dpxCvmTArXq-FVZqy5WTgl0QTcLamYMovaqgE',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          // Successfully synced - remove from outbox
          await deleteFromStore(db, 'outbox', item.id);
          synced++;
          console.log('[SW] Synced item:', item.id);
        }
      } catch (err) {
        console.error('[SW] Failed to sync item:', item.id, err);
      }
    }

    // Notify clients
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_COMPLETE',
        count: synced
      });
    });

    console.log(`[SW] Sync complete: ${synced}/${items.length} items synced`);
  } catch (err) {
    console.error('[SW] Sync error:', err);
  }
}

// IndexedDB helpers
function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('jbf_offline', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('outbox')) {
        db.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

function getAllFromStore(db, storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function deleteFromStore(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

console.log('[SW] Service Worker v2.1-PRO-SITE loaded');
