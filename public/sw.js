/* HELD Orders — service worker.
 * Caches STATIC ASSETS ONLY (never API responses or HTML navigations).
 * Data integrity rule (CLAUDE.md): drafts and orders live on the server;
 * the SW must never serve stale data. So we bypass everything dynamic.
 */
const CACHE = 'held-static-v2'

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

/* ── Web Push ──────────────────────────────────────────────────────────────
 * Payload shape (set by PushService): { title, body, url }.
 */
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (err) {
    data = { body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'HELD'
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    dir: 'rtl',
    lang: 'he',
    data: { url: data.url || '/' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        const url = new URL(client.url)
        if (url.pathname === target && 'focus' in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(target)
      return undefined
    })
  )
})

