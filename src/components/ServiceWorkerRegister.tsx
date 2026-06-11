'use client'

import { useEffect } from 'react'

/**
 * Registers the PWA service worker on the client.
 * Only runs in production builds and when the browser supports SW.
 * Failures are swallowed — the app must work without offline caching.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* no-op: offline caching is a progressive enhancement */
      })
    }

    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })
  }, [])

  return null
}
