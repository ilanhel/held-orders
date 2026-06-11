'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { i18n } from '@/lib/i18n'

type Step = 'phone' | 'otp'

export default function LoginPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [demoCode, setDemoCode] = useState<string | null>(null)

  async function requestOtp(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setInfo(null)
    try {
      const res = await fetch('/api/auth/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error?.message ?? i18n.errors.serverError)
        return
      }
      setInfo(i18n.auth.otpSent)
      setDemoCode(typeof data?.demoCode === 'string' ? data.demoCode : null)
      setStep('otp')
    } catch {
      setError(i18n.errors.network)
    } finally {
      setLoading(false)
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code }),
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

        {step === 'phone' && (
          <form onSubmit={requestOtp} className="space-y-4">
            <label className="block">
              <span className="text-gray-700 text-base font-medium">
                {i18n.auth.phoneLabel}
              </span>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                dir="ltr"
                className="mt-2 block w-full rounded-lg border border-gray-300 px-4 py-3 text-lg focus:border-primary focus:ring-1 focus:ring-primary text-left"
                placeholder={i18n.auth.phonePlaceholder}
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                maxLength={10}
                required
              />
            </label>
            <button
              type="submit"
              disabled={loading || phone.length !== 10}
              className="w-full bg-primary text-white font-semibold py-3 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed active:bg-red-700"
            >
              {loading ? i18n.common.loading : i18n.auth.sendOtp}
            </button>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={verifyOtp} className="space-y-4">
            <p className="text-sm text-gray-600">
              {info}{' '}
              <span dir="ltr" className="font-mono">
                {phone}
              </span>
            </p>
            {demoCode && (
              <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-sm">
                {i18n.auth.demoCodeLabel}{' '}
                <span dir="ltr" className="font-mono text-lg font-bold tracking-widest">
                  {demoCode}
                </span>
              </div>
            )}
            <label className="block">
              <span className="text-gray-700 text-base font-medium">
                {i18n.auth.otpLabel}
              </span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                dir="ltr"
                className="mt-2 block w-full rounded-lg border border-gray-300 px-4 py-3 text-2xl tracking-widest text-center focus:border-primary focus:ring-1 focus:ring-primary"
                placeholder={i18n.auth.otpPlaceholder}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                maxLength={6}
                required
                autoFocus
              />
            </label>
            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="w-full bg-primary text-white font-semibold py-3 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed active:bg-red-700"
            >
              {loading ? i18n.common.loading : i18n.auth.verifyOtp}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep('phone')
                setCode('')
                setError(null)
                setDemoCode(null)
              }}
              className="w-full text-gray-500 py-2 text-sm"
            >
              {i18n.auth.backToPhone}
            </button>
          </form>
        )}

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}
      </div>
    </main>
  )
}
