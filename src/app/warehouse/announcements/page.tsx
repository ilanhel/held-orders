'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { i18n } from '@/lib/i18n'

type SentAnnouncement = {
  id: string
  title: string
  body: string
  requiresAck: boolean
  expiresAt: string | null
  createdAt: string
  ackCount: number
  recipientCount: number
}

type AckDetail = {
  announcementId: string
  title: string
  requiresAck: boolean
  recipientCount: number
  acked: { userId: string; name: string; phone: string; ackedAt: string }[]
  pending: { userId: string; name: string; phone: string }[]
}

const a = i18n.announcements

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function AnnouncementsPage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [requiresAck, setRequiresAck] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [sent, setSent] = useState<SentAnnouncement[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [detail, setDetail] = useState<AckDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const loadSent = useCallback(async () => {
    try {
      const res = await fetch('/api/announcements?admin=1')
      if (res.status === 401) {
        router.push('/login')
        return
      }
      const data = await res.json()
      if (res.ok) setSent(data.announcements ?? [])
    } catch {
      /* non-fatal: the compose form still works */
    }
  }, [router])

  useEffect(() => {
    void loadSent()
  }, [loadSent])

  async function toggleReceipts(id: string) {
    if (openId === id) {
      setOpenId(null)
      setDetail(null)
      return
    }
    setOpenId(id)
    setDetail(null)
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/announcements/${id}/acks`)
      const data = await res.json()
      if (res.ok) setDetail(data.detail)
    } catch {
      /* non-fatal */
    } finally {
      setDetailLoading(false)
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setSuccess(false)
    try {
      const res = await fetch('/api/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, requiresAck }),
      })
      const data = await res.json()
      if (res.status === 401) {
        router.push('/login')
        return
      }
      if (!res.ok) {
        setError(data?.error?.message ?? i18n.errors.serverError)
      } else {
        setSuccess(true)
        setTitle('')
        setBody('')
        setRequiresAck(false)
        void loadSent()
      }
    } catch {
      setError(i18n.errors.network)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => router.push('/warehouse')}
          className="text-gray-500 text-sm"
        >
          → {i18n.common.back}
        </button>
        <h1 className="text-xl font-bold flex-1 text-center">
          {i18n.announcements.newTitle}
        </h1>
        <span className="w-10" />
      </header>

      <form onSubmit={send} className="p-4 max-w-xl mx-auto space-y-4">
        <label className="block">
          <span className="text-gray-700 font-medium">
            {i18n.announcements.titleField}
          </span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={120}
            className="mt-2 w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base"
          />
        </label>

        <label className="block">
          <span className="text-gray-700 font-medium">
            {i18n.announcements.bodyField}
          </span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
            maxLength={2000}
            rows={6}
            className="mt-2 w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base resize-y"
          />
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={requiresAck}
            onChange={(e) => setRequiresAck(e.target.checked)}
            className="w-5 h-5"
          />
          <span className="text-gray-700">
            {i18n.announcements.requireAckCheckbox}
          </span>
        </label>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
            ✓ {i18n.announcements.sent}
          </div>
        )}

        <button
          type="submit"
          disabled={busy || !title.trim() || !body.trim()}
          className="w-full bg-primary text-white font-semibold py-3 rounded-lg disabled:opacity-50 active:bg-red-700"
        >
          {busy ? i18n.common.loading : i18n.announcements.send}
        </button>
      </form>

      <section className="p-4 max-w-xl mx-auto">
        <h2 className="text-lg font-bold text-gray-800 mb-3">{a.sentTitle}</h2>
        {sent.length === 0 ? (
          <p className="text-gray-500 text-center py-6">{a.noSent}</p>
        ) : (
          <ul className="space-y-3">
            {sent.map((ann) => {
              const expired = ann.expiresAt !== null && new Date(ann.expiresAt) <= new Date()
              return (
                <li key={ann.id} className="bg-white rounded-xl border border-gray-200 p-3">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900">{ann.title}</span>
                        {ann.requiresAck && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                            {a.requiresAck}
                          </span>
                        )}
                        {expired && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">
                            {a.expired}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{ann.body}</p>
                      <p className="text-xs text-gray-400 mt-1">{formatDateTime(ann.createdAt)}</p>
                    </div>
                    {ann.requiresAck && (
                      <span className="text-sm font-semibold text-primary whitespace-nowrap">
                        {a.readCount} {ann.ackCount}/{ann.recipientCount}
                      </span>
                    )}
                  </div>

                  {ann.requiresAck && (
                    <button
                      onClick={() => toggleReceipts(ann.id)}
                      className="mt-2 text-sm text-primary font-medium"
                    >
                      {openId === ann.id ? a.hideReceipts : a.viewReceipts}
                    </button>
                  )}

                  {openId === ann.id && (
                    <div className="mt-2 border-t border-gray-100 pt-2">
                      {detailLoading || !detail ? (
                        <p className="text-sm text-gray-400 py-2">{i18n.common.loading}</p>
                      ) : (
                        <div className="space-y-3">
                          <div>
                            <p className="text-xs font-semibold text-green-700 mb-1">
                              {a.acked} ({detail.acked.length})
                            </p>
                            {detail.acked.length === 0 ? (
                              <p className="text-xs text-gray-400">—</p>
                            ) : (
                              <ul className="space-y-0.5">
                                {detail.acked.map((u) => (
                                  <li
                                    key={u.userId}
                                    className="text-sm text-gray-700 flex justify-between gap-2"
                                  >
                                    <span>{u.name}</span>
                                    <span className="text-xs text-gray-400">
                                      {formatDateTime(u.ackedAt)}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-gray-500 mb-1">
                              {a.pending} ({detail.pending.length})
                            </p>
                            {detail.pending.length === 0 ? (
                              <p className="text-xs text-green-600">{a.everyoneAcked}</p>
                            ) : (
                              <ul className="space-y-0.5">
                                {detail.pending.map((u) => (
                                  <li key={u.userId} className="text-sm text-gray-500">
                                    {u.name}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </main>
  )
}
