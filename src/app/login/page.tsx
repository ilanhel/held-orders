'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { i18n } from '@/lib/i18n'

export default function LoginPage() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error?.message ?? i18n.errors.serverError)
        return
      }
      // Route by role
      const role = data?.user?.role
      if (role === 'WAREHOUSE') router.push('/warehouse')
      else if (role === 'ADMIN') router.push('/admin')
      else router.push('/catalog')
    } catch {
      setError(i18n.errors.network)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-start justify-center pt-16 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <h1 className="text-3xl font-bold text-primary mb-2">{i18n.app.name}</h1>
        <p className="text-gray-500 mb-8">{i18n.app.tagline}</p>

        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="text-gray-700 text-base font-medium">
              {i18n.auth.passwordLabel}
            </span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              dir="ltr"
              className="mt-2 block w-full rounded-lg border border-gray-300 px-4 py-3 text-2xl tracking-widest text-center focus:border-primary focus:ring-1 focus:ring-primary"
              placeholder={i18n.auth.passwordPlaceholder}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              maxLength={6}
              required
              autoFocus
            />
          </label>
          <p className="text-sm text-gray-500">{i18n.auth.passwordHint}</p>
          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="w-full bg-primary text-white font-semibold py-3 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed active:bg-red-700"
          >
            {loading ? i18n.common.loading : i18n.auth.loginButton}
          </button>
        </form>

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}
      </div>
    </main>
  )
}
