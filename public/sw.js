const OFFLINE_PAGE_CACHE_NAME = 'omr-offline-pages-v1';
const OFFLINE_ASSET_CACHE_NAME = 'omr-offline-assets-v1';
const OFFLINE_FALLBACK_URL = '/offline.html';
const OFFLINE_PAGE_ROUTE_PATTERN = /^\/(?:$|library\/?$|books\/[^/]+\/?$|read\/[^/]+\/?$)/;
const LOCAL_DEVELOPMENT_HOSTNAME_PATTERN = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i;

function isLocalDevelopmentHost(hostname) {
  return LOCAL_DEVELOPMENT_HOSTNAME_PATTERN.test(hostname)
    || /^192\.168\./.test(hostname)
    || /^10\./.test(hostname)
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
}

const SHOULD_DISABLE_OFFLINE_SUPPORT = isLocalDevelopmentHost(self.location.hostname);

async function clearOfflineCaches() {
  const cacheNames = await caches.keys();

  await Promise.all(
    cacheNames
      .filter((cacheName) => cacheName === OFFLINE_PAGE_CACHE_NAME || cacheName === OFFLINE_ASSET_CACHE_NAME)
      .map((cacheName) => caches.delete(cacheName))
  );
}

if (SHOULD_DISABLE_OFFLINE_SUPPORT) {
  self.addEventListener('install', (event) => {
    event.waitUntil(self.skipWaiting());
  });

  self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
      await clearOfflineCaches();
      await self.registration.unregister();

      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      clients.forEach((client) => {
        if (typeof client.navigate === 'function') {
          client.navigate(client.url);
        }
      });
    })());
  });
} else {

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const pageCache = await caches.open(OFFLINE_PAGE_CACHE_NAME);
    await pageCache.add(OFFLINE_FALLBACK_URL);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    const validCacheNames = new Set([OFFLINE_PAGE_CACHE_NAME, OFFLINE_ASSET_CACHE_NAME]);

    await Promise.all(
      cacheNames
        .filter((cacheName) => !validCacheNames.has(cacheName))
        .map((cacheName) => caches.delete(cacheName))
    );

    await self.clients.claim();
  })());
});

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function shouldCachePage(url) {
  return isSameOrigin(url) && OFFLINE_PAGE_ROUTE_PATTERN.test(url.pathname);
}

function shouldCacheAsset(request, url) {
  if (!isSameOrigin(url) || url.pathname.startsWith('/api/')) {
    return false;
  }

  return (
    request.destination === 'script'
    || request.destination === 'style'
    || request.destination === 'font'
    || request.destination === 'image'
    || url.pathname === OFFLINE_FALLBACK_URL
    || url.pathname.startsWith('/_next/static/')
    || url.pathname.startsWith('/covers/')
  );
}

async function matchOfflinePage(request) {
  const cache = await caches.open(OFFLINE_PAGE_CACHE_NAME);
  const url = new URL(request.url);

  return (
    await cache.match(request)
    || await cache.match(url.pathname)
    || await cache.match(OFFLINE_FALLBACK_URL)
    || null
  );
}

async function networkFirstPage(request) {
  const cache = await caches.open(OFFLINE_PAGE_CACHE_NAME);
  const url = new URL(request.url);

  try {
    const response = await fetch(request);

    if (response && response.ok) {
      await cache.put(url.pathname, response.clone());
    }

    return response;
  } catch {
    const cachedResponse = await matchOfflinePage(request);
    return cachedResponse || Response.error();
  }
}

async function staleWhileRevalidateAsset(request) {
  const cache = await caches.open(OFFLINE_ASSET_CACHE_NAME);
  const cachedResponse = await cache.match(request);

  const networkResponsePromise = fetch(request)
    .then(async (response) => {
      if (response && response.ok) {
        await cache.put(request, response.clone());
      }

      return response;
    })
    .catch(() => null);

  if (cachedResponse) {
    return cachedResponse;
  }

  const networkResponse = await networkResponsePromise;
  return networkResponse || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  if (request.mode === 'navigate' && shouldCachePage(url)) {
    event.respondWith(networkFirstPage(request));
    return;
  }

  if (shouldCacheAsset(request, url)) {
    event.respondWith(staleWhileRevalidateAsset(request));
  }
});
}
