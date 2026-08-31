'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { i18n, type OrderStatusKey } from '@/lib/i18n'
import { formatTotal } from '@/lib/format'

type OrderRow = {
  id: string
  number: number | null
  storeName: string
  status: OrderStatusKey
  warehouseMark: 'YELLOW' | 'GREEN' | null
  submittedAt: string | null
  items: { id: string }[]
  totalAgorot: number
}

const STATUS_COLOR: Record<OrderStatusKey, string> = {
  DRAFT: 'bg-gray-200 text-gray-700',
  SUBMITTED: 'bg-orange-100 text-orange-800',
  RECEIVED: 'bg-blue-100 text-blue-800',
  PICKING: 'bg-yellow-100 text-yellow-800',
  READY: 'bg-green-100 text-green-800',
  SHIPPED: 'bg-gray-100 text-gray-600',
  CANCELLED: 'bg-red-100 text-red-700',
}

export default function WarehousePage() {
  const router = useRouter()
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'open' | 'history'>('open')
  // Kept in sync inside switchView (the only place view changes) — the polling
  // interval reads it without re-subscribing on every tab switch.
  const viewRef = useRef<'open' | 'history'>('open')

  async function load(target?: 'open' | 'history') {
    const v = target ?? viewRef.current
    try {
      const res = await fetch(`/api/warehouse/queue${v === 'history' ? '?view=history' : ''}`)
      if (res.status === 401) {
        router.push('/login')
        return
      }
      const data = await res.json()
      if (viewRef.current !== v) return // user switched tab while fetching
      if (!res.ok) {
        setError(data?.error?.message ?? i18n.errors.serverError)
      } else {
        setOrders(data.orders ?? [])
        setError(null)
      }
    } catch {
      if (viewRef.current === v) setError(i18n.errors.network)
    } finally {
      setLoading(false)
    }
  }

  function switchView(v: 'open' | 'history') {
    if (v === viewRef.current) return
    viewRef.current = v
    setView(v)
    setOrders([])
    setLoading(true)
    void load(v)
  }

  useEffect(() => {
    void load()
    // Push-like freshness without manual refresh: poll every 10s, and reload
    // immediately when the iPad wakes up / returns to the tab.
    const t = setInterval(load, 10_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <h1 className="text-xl font-bold text-primary flex-1">
          {i18n.warehouse.title}
        </h1>
        <button
          onClick={() => router.push('/warehouse/announcements')}
          className="text-sm text-gray-600 hover:text-primary"
        >
          📢 {i18n.announcements.title}
        </button>
        <button onClick={logout} className="text-sm text-gray-500">
          {i18n.auth.logout}
        </button>
      </header>

      <section className="px-4 py-4">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-lg font-semibold text-gray-800 flex-1">
            {view === 'open' ? i18n.warehouse.queue : i18n.warehouse.tabHistory} ({orders.length})
          </h2>
          <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
            <button
              onClick={() => switchView('open')}
              className={`px-4 py-2 min-h-[44px] ${view === 'open' ? 'bg-held-primary text-white font-semibold' : 'bg-white text-gray-700'}`}
            >
              {i18n.warehouse.tabOpen}
            </button>
            <button
              onClick={() => switchView('history')}
              className={`px-4 py-2 min-h-[44px] ${view === 'history' ? 'bg-held-primary text-white font-semibold' : 'bg-white text-gray-700'}`}
            >
              {i18n.warehouse.tabHistory}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-gray-500">{i18n.common.loading}</p>
        ) : orders.length === 0 ? (
          <p className="text-gray-500 text-center py-12">
            {view === 'open' ? i18n.warehouse.queueEmpty : i18n.warehouse.historyEmpty}
          </p>
        ) : (
          <ul className="space-y-2">
            {orders.map((o) => (
              <li key={o.id}>
                <button
                  onClick={() => router.push(`/warehouse/${o.id}`)}
                  className={`w-full text-right rounded-xl border p-4 hover:border-primary transition flex items-center gap-3 ${
                    o.warehouseMark === 'YELLOW'
                      ? 'bg-yellow-100 border-yellow-400'
                      : o.warehouseMark === 'GREEN'
                        ? 'bg-green-100 border-green-400'
                        : 'bg-white border-gray-200'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-gray-900">
                        #{o.number ?? '—'}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[o.status]}`}
                      >
                        {i18n.orders.statuses[o.status]}
                      </span>
                      {o.warehouseMark && (
                        <span className="text-xs font-semibold">
                          {o.warehouseMark === 'YELLOW'
                            ? `🟡 ${i18n.warehouse.mark.yellow}`
                            : `🟢 ${i18n.warehouse.mark.green}`}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-700">{o.storeName}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {o.items.length} {i18n.orders.items} · {formatTotal(o.totalAgorot)}
                      {o.submittedAt && (
                        <span className="mr-2">
                          · {new Date(o.submittedAt).toLocaleString('he-IL', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-gray-300 text-xl">‹</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
