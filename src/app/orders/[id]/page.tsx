'use client'

import { useEffect, useState, use } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { i18n, type OrderStatusKey } from '@/lib/i18n'

type OrderItem = {
  id: string
  productId: string
  productName: string
  productBarcode: string
  priceAgorot: number
  qtyOrdered: number
  qtySupplied: number | null
}

type Order = {
  id: string
  number: number | null
  status: OrderStatusKey
  storeName: string
  submittedAt: string | null
  createdAt: string
  items: OrderItem[]
  totalAgorot: number
}

export default function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const search = useSearchParams()
  const submittedFlag = search.get('submitted') === '1'

  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/orders/${id}`)
        if (res.status === 401) {
          router.push('/login')
          return
        }
        const data = await res.json()
        if (!cancelled) {
          if (!res.ok) setError(data?.error?.message ?? i18n.errors.serverError)
          else setOrder(data.order)
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
  }, [id, router])

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">{i18n.common.loading}</p>
      </main>
    )
  }
  if (error || !order) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <p className="text-red-600">{error ?? i18n.errors.notFound}</p>
      </main>
    )
  }

  const statusLabel = i18n.orders.statuses[order.status] ?? order.status

  return (
    <main className="min-h-screen bg-gray-50 pb-12">
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => router.push('/catalog')}
          className="text-gray-500 text-sm"
        >
          → {i18n.common.back}
        </button>
        <h1 className="text-xl font-bold flex-1 text-center">
          {i18n.orders.orderNumber} #{order.number ?? '—'}
        </h1>
        <span className="w-10" />
      </header>

      {submittedFlag && (
        <div className="mx-4 mt-4 p-4 bg-green-50 border border-green-200 text-green-800 rounded-lg text-center">
          ✓ {i18n.orders.submittedSuccess}
        </div>
      )}

      <section className="px-4 pt-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">{order.storeName}</span>
            <span className="bg-primary text-white text-xs px-3 py-1 rounded-full">
              {statusLabel}
            </span>
          </div>
          <div className="text-sm text-gray-500">
            {order.submittedAt
              ? new Date(order.submittedAt).toLocaleString('he-IL')
              : new Date(order.createdAt).toLocaleString('he-IL')}
          </div>
        </div>

        <h2 className="font-semibold text-gray-700 mb-2">
          {order.items.length} {i18n.orders.items}
        </h2>
        <ul className="space-y-2">
          {order.items.map((item) => (
            <li
              key={item.id}
              className="bg-white rounded-xl border border-gray-200 p-3"
            >
              <div className="font-semibold text-gray-900">{item.productName}</div>
              <div className="text-xs text-gray-400 font-mono mt-0.5" dir="ltr">
                {item.productBarcode}
              </div>
              <div className="flex items-center justify-between mt-2 text-sm">
                <span className="text-gray-600">
                  {i18n.orders.qty}: {item.qtyOrdered}
                  {item.qtySupplied !== null && item.qtySupplied !== item.qtyOrdered && (
                    <span className="text-orange-600 mr-2">
                      ({i18n.orders.qtySupplied}: {item.qtySupplied})
                    </span>
                  )}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
