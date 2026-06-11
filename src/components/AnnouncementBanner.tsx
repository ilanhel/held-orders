'use client'

import { useEffect, useState } from 'react'
import { i18n } from '@/lib/i18n'

type Announcement = {
  id: string
  title: string
  body: string
  requiresAck: boolean
  expiresAt: string | null
  createdAt: string
  ackedByMe: boolean
}

/**
 * Sticky banner that shows unacked announcements at the top of franchisee pages.
 * - Auto-acks non-required announcements when dismissed.
 * - Required-ack announcements block dismissal until "הבנתי" is clicked.
 */
export function AnnouncementBanner() {
  const [items, setItems] = useState<Announcement[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/announcements')
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) setItems(data.announcements ?? [])
      } catch {
        // silent — banner is a nice-to-have
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const visible = items.filter((a) => !a.ackedByMe)
  if (visible.length === 0) return null

  const current = visible[0]

  async function ack() {
    setBusy(true)
    try {
      await fetch(`/api/announcements/${current.id}/ack`, { method: 'POST' })
      setItems((arr) =>
        arr.map((a) => (a.id === current.id ? { ...a, ackedByMe: true } : a))
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-3">
      <div className="flex items-start gap-3">
        <span className="text-xl">📢</span>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-gray-900">{current.title}</div>
          <div className="text-sm text-gray-700 whitespace-pre-line mt-1">
            {current.body}
          </div>
        </div>
        <button
          onClick={ack}
          disabled={busy}
          className="bg-yellow-500 text-white text-sm font-medium px-3 py-1.5 rounded-lg disabled:opacity-50 flex-shrink-0"
        >
          {i18n.announcements.ack}
        </button>
      </div>
      {visible.length > 1 && (
        <div className="text-xs text-yellow-700 mt-2">
          +{visible.length - 1} עוד
        </div>
      )}
    </div>
  )
}
