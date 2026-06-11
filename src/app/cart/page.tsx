'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { i18n } from '@/lib/i18n'
import { formatPrice, formatTotal } from '@/lib/format'
import { QtyStepper } from '@/components/QtyStepper'

type OrderItem = {
  id: string
  productId: string
  productName: string
  productBarcode: string
  priceAgorot: number
  qtyOrdered: number
}

type Order = {
  id: string
  number: number | null
  status: string
  items: OrderItem[]
  totalAgorot: number
}

export default function CartPage() {
  const router = useRouter()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savingFor, setSavingFor] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/orders/draft')
        if (res.status === 401) {
          router.push('/login')
          return
        }
        const data = await res.json()
        if (!cancelled) setOrder(data.order)
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

  async function changeQty(productId: string, qty: number) {
    if (qty < 0) qty = 0
    setSavingFor(productId)
    setError(null)
    try {
      const res = await fetch('/api/orders/draft/items', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, qty }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error?.message ?? i18n.errors.serverError)
        return
      }
      setOrder(data.order)
    } catch {
      setError(i18n.errors.network)
    } finally {
      setSavingFor(null)
    }
  }

  async function submit() {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/orders/draft/submit', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        const code = data?.error?.code
        const msg =
          code === 'ORDER_EMPTY'
            ? i18n.errors.orderEmpty
            : code === 'PRODUCT_HIDDEN'
              ? i18n.errors.productHidden
              : (data?.error?.message ?? i18n.errors.serverError)
        setError(msg)
        return
      }
      router.push(`/orders/${data.order.id}?submitted=1`)
    } catch {
      setError(i18n.errors.network)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">{i18n.common.loading}</p>
      </main>
    )
  }

  const isEmpty = !order || order.items.length === 0

  return (
    <main className="min-h-screen bg-gray-50 pb-32">
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => router.push('/catalog')}
          className="text-gray-500 text-sm"
        >
          → {i18n.common.back}
        </button>
        <h1 className="text-xl font-bold flex-1 text-center">{i18n.orders.cart}</h1>
        <span className="w-10" />
      </header>

      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {isEmpty ? (
        <div className="text-center py-20">
          <p className="text-gray-500 mb-4">{i18n.orders.cartEmpty}</p>
          <button
            onClick={() => router.push('/catalog')}
            className="text-primary font-semibold"
          >
            {i18n.catalog.title} ←
          </button>
        </div>
      ) : (
        <>
          <ul className="px-4 py-4 space-y-2">
            {order!.items.map((item) => (
              <li
                key={item.id}
                className="bg-white rounded-xl border border-gray-200 p-3 flex gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900">
                    {item.productName}
                  </div>
                  <div className="text-xs text-gray-400 font-mono mt-0.5" dir="ltr">
                    {item.productBarcode}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    {formatPrice(item.priceAgorot)} × {item.qtyOrdered} ={' '}
                    <span className="font-semibold text-primary">
                      {formatTotal(item.priceAgorot * item.qtyOrdered)}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-center justify-center gap-1">
                  <QtyStepper
                    qty={item.qtyOrdered}
                    onChange={(q) => changeQty(item.productId, q)}
                    saving={savingFor === item.productId}
                    size="sm"
                  />
                  <button
                    onClick={() => changeQty(item.productId, 0)}
                    disabled={savingFor === item.productId}
                    className="text-xs text-gray-400 hover:text-red-500"
                  >
                    {i18n.catalog.remove}
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-4 shadow-lg pb-safe">
            <div className="flex items-center justify-between mb-3">
              <span className="text-gray-700">{i18n.orders.total}</span>
              <span className="text-2xl font-bold text-primary">
                {formatTotal(order!.totalAgorot)}
              </span>
            </div>
            <button
              onClick={submit}
              disabled={submitting}
              className="w-full bg-primary text-white font-semibold py-4 rounded-lg disabled:opacity-50 active:bg-red-700 text-lg"
            >
              {submitting ? i18n.orders.submitting : i18n.orders.submit}
            </button>
          </div>
        </>
      )}
    </main>
  )
}
