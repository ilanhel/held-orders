'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { i18n, type OrderStatusKey } from '@/lib/i18n'
import { formatTotal } from '@/lib/format'

type OrderRow = {
  id: string
  number: number | null
  status: OrderStatusKey
  submittedAt: string | null
  createdAt: string
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

export default function MyOrdersPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reorderingId, setReorderingId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/orders')
        if (res.status === 401) {
          router.push('/login')
          return
        }
        const data = await res.json()
        if (!cancelled) {
          if (!res.ok) setError(data?.error?.message ?? i18n.errors.serverError)
          else setOrders(data.orders ?? [])
        }
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
  }, [router])

  async function reorder(sourceOrderId: string) {
    setReorderingId(sourceOrderId)
    setToast(null)
    try {
      const res = await fetch('/api/orders/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceOrderId }),
      })
      const data = await res.json()
      if (res.status === 401) {
        router.push('/login')
        return
      }
      if (!res.ok) {
        setToast(data?.error?.message ?? i18n.errors.serverError)
        return
      }
      if (data.skipped > 0) setToast(i18n.orders.reorderSkipped)
      router.push('/cart')
    } catch {
      setToast(i18n.errors.network)
    } finally {
      setReorderingId(null)
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-12">
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.push('/catalog')} className="text-gray-500 text-sm">
          → {i18n.orders.backToCatalog}
        </button>
        <h1 className="text-xl font-bold flex-1 text-center text-primary">
          {i18n.orders.myOrders}
        </h1>
        <span className="w-16" />
      </header>

      {toast && (
        <div className="mx-4 mt-4 p-3 bg-blue-50 border border-blue-200 text-blue-800 rounded-lg text-sm text-center">
          {toast}
        </div>
      )}

      <section className="px-4 py-4">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-gray-500 text-center py-12">{i18n.common.loading}</p>
        ) : orders.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-700 font-semibold mb-1">{i18n.orders.noOrders}</p>
            <p className="text-gray-400 text-sm mb-6">{i18n.orders.noOrdersHint}</p>
            <button
              onClick={() => router.push('/catalog')}
              className="bg-primary text-white px-6 py-3 rounded-xl font-semibold"
            >
              {i18n.orders.backToCatalog}
            </button>
          </div>
        ) : (
          <ul className="space-y-3">
            {orders.map((o) => (
              <li
                key={o.id}
                className="bg-white rounded-xl border border-gray-200 p-4"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-bold text-gray-900">
                    {i18n.orders.orderNumber} #{o.number ?? '—'}
                  </span>
                  <span
                    className={`text-xs px-3 py-1 rounded-full ${STATUS_COLOR[o.status]}`}
                  >
                    {i18n.orders.statuses[o.status]}
                  </span>
                  <span className="flex-1" />
                  <span className="text-sm text-gray-400">
                    {o.submittedAt
                      ? new Date(o.submittedAt).toLocaleDateString('he-IL')
                      : new Date(o.createdAt).toLocaleDateString('he-IL')}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm mb-3">
                  <span className="text-gray-500">
                    {o.items.length} {i18n.orders.items}
                  </span>
                  <span className="font-semibold text-primary">
                    {formatTotal(o.totalAgorot)}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => router.push(`/orders/${o.id}`)}
                    className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2 text-sm font-medium"
                  >
                    {i18n.orders.openOrder}
                  </button>
                  <button
                    onClick={() => reorder(o.id)}
                    disabled={reorderingId === o.id}
                    className="flex-1 bg-primary text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-60"
                  >
                    {reorderingId === o.id ? i18n.orders.reordering : i18n.orders.reorder}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
