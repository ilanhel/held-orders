/* HELD Orders — service worker.
 * Caches STATIC ASSETS ONLY (never API responses or HTML navigations).
 * Data integrity rule (CLAUDE.md): drafts and orders live on the server;
 * the SW must never serve stale data. So we bypass everything dynamic.
 */
const CACHE = 'held-static-v1'

// Match hashed build assets and static files we are safe to cache.
function isStaticAsset(url) {
  if (url.origin !== self.location.origin) return false
  if (url.pathname.startsWith('/api/')) return false
  return (
    url.pathname.startsWith('/_next/static/') ||
    /\.(?:js|css|woff2?|ttf|otf|eot|svg|png|jpg|jpeg|gif|webp|ico)$/.test(url.pathname) ||
    url.pathname === '/manifest.json'
  )
}

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Only intercept cacheable static assets; let everything else hit the network.
  if (!isStaticAsset(url)) return

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request)
      if (cached) return cached
      try {
        const response = await fetch(request)
        if (response.ok) cache.put(request, response.clone())
        return response
      } catch (err) {
        // Offline and not cached — nothing we can do for this asset.
        return cached || Response.error()
      }
    })
  )
})
