'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { i18n } from '@/lib/i18n'

export default function AnnouncementsPage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [requiresAck, setRequiresAck] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

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
    </main>
  )
}
