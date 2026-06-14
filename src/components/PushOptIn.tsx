'use client'

import { useEffect, useState, useCallback } from 'react'
import { i18n } from '@/lib/i18n'

const t = i18n.push

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

type State = 'hidden' | 'prompt' | 'enabled' | 'busy'

/**
 * PushOptIn — a small banner that lets the user enable browser push
 * notifications. Self-hides when push is unsupported, already granted, blocked,
 * or not configured on the server. Mobile-first, RTL.
 */
export function PushOptIn() {
  const [state, setState] = useState<State>('hidden')

  const supported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window

  const refresh = useCallback(async () => {
    if (!supported) return setState('hidden')
    if (Notification.permission === 'denied') return setState('hidden')
    try {
      const reg = await navigator.serviceWorker.ready
      const existing = await reg.pushManager.getSubscription()
      if (existing) return setState('enabled')
      // Only offer if the server actually has VAPID configured.
      const res = await fetch('/api/push/vapid-public-key')
      if (!res.ok) return setState('hidden')
      setState('prompt')
    } catch {
      setState('hidden')
    }
  }, [supported])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function enable() {
    if (!supported) return
    setState('busy')
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState('hidden')
        return
      }
      const res = await fetch('/api/push/vapid-public-key')
      if (!res.ok) {
        setState('hidden')
        return
      }
      const { publicKey } = (await res.json()) as { publicKey: string }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })
      const json = sub.toJSON()
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
        }),
      })
      setState('enabled')
    } catch {
      setState('hidden')
    }
  }

  if (state === 'hidden' || state === 'enabled') return null

  return (
    <div className="mb-3 flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
      <span className="text-lg" aria-hidden>
        🔔
      </span>
      <p className="flex-1 text-gray-700">{t.prompt}</p>
      <button
        onClick={enable}
        disabled={state === 'busy'}
        className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
      >
        {state === 'busy' ? t.enabling : t.enable}
      </button>
    </div>
  )
}
