'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { i18n } from '@/lib/i18n'

const t = i18n.admin.settings

export default function AdminSettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/settings')
        if (res.status === 401 || res.status === 403) {
          router.push('/login')
          return
        }
        const data = await res.json()
        if (cancelled) return
        setPhone(data.settings?.specialFramesPhone ?? '')
      } catch {
        if (!cancelled) setError(i18n.errors.network)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function save() {
    setSaving(true)
    setError(null)
    setInfo(null)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specialFramesPhone: phone.trim() || null }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error?.message ?? i18n.errors.serverError)
        return
      }
      setPhone(data.settings?.specialFramesPhone ?? '')
      setInfo(t.saved)
    } catch {
      setError(i18n.errors.network)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen grid place-items-center bg-gray-50">
        <p className="text-gray-500">{i18n.common.loading}</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.push('/admin')} className="text-gray-500 text-sm">
          → {i18n.common.back}
        </button>
        <h1 className="text-xl font-bold flex-1 text-center">{t.title}</h1>
        <span className="w-10" />
      </header>

      <section className="px-4 py-6 max-w-lg mx-auto">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}
        {info && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
            {info}
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <label className="block font-semibold text-gray-800 mb-1">
            🖼️ {t.specialFramesPhone}
          </label>
          <p className="text-xs text-gray-500 mb-3">{t.specialFramesPhoneHint}</p>
          <input
            type="text"
            inputMode="tel"
            dir="ltr"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t.specialFramesPhonePlaceholder}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-left"
          />
          <button
            onClick={() => void save()}
            disabled={saving}
            className="mt-4 w-full min-h-[44px] bg-primary text-white rounded-lg font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {saving ? t.saving : t.save}
          </button>
        </div>
      </section>
    </main>
  )
}
