'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { i18n } from '@/lib/i18n'
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
  // Optimistic-update bookkeeping (same pattern as the catalog page).
  const pendingQty = useRef<Map<string, number>>(new Map())
  const syncTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const syncChains = useRef<Map<string, Promise<void>>>(new Map())

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

  function changeQty(productId: string, qty: number) {
    if (qty < 0) qty = 0
    setError(null)
    // Optimistic: update the UI immediately, sync to the server in the
    // background. Rapid consecutive taps coalesce into a single request.
    pendingQty.current.set(productId, qty)
    setOrder((o) => patchOrder(o, productId, qty))
    const t = syncTimers.current.get(productId)
    if (t) clearTimeout(t)
    syncTimers.current.set(
      productId,
      setTimeout(() => void queueSync(productId), 300)
    )
  }

  // Return a copy of the order with the given product's qty updated (or the
  // item removed when qty=0) and the total recomputed.
  function patchOrder(o: Order | null, productId: string, qty: number): Order | null {
    if (!o) return o
    const items =
      qty <= 0
        ? o.items.filter((it) => it.productId !== productId)
        : o.items.map((it) =>
            it.productId === productId ? { ...it, qtyOrdered: qty } : it
          )
    const totalAgorot = items.reduce((s, it) => s + it.priceAgorot * it.qtyOrdered, 0)
    return { ...o, items, totalAgorot }
  }

  // Overlay all still-pending optimistic quantities on a server order, so a
  // server response never clobbers newer local edits.
  function applyPending(serverOrder: Order | null): Order | null {
    let o = serverOrder
    for (const [pid, q] of pendingQty.current) o = patchOrder(o, pid, q)
    return o
  }

  function queueSync(productId: string): Promise<void> {
    const prev = syncChains.current.get(productId) ?? Promise.resolve()
    const next = prev.then(() => doSync(productId))
    syncChains.current.set(productId, next)
    return next
  }

  async function doSync(productId: string) {
    const qty = pendingQty.current.get(productId)
    if (qty === undefined) return
    try {
      const res = await fetch('/api/orders/draft/items', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, qty }),
      })
      const data = await res.json().catch(() => ({}))
      if (pendingQty.current.get(productId) === qty)
        pendingQty.current.delete(productId)
      if (!res.ok) {
        setError(data?.error?.message ?? i18n.errors.serverError)
        // Re-fetch server truth so the optimistic UI doesn't stay wrong.
        try {
          const fresh = await fetch('/api/orders/draft')
          if (fresh.ok) {
            const d = await fresh.json()
            setOrder(applyPending(d.order ?? null))
          }
        } catch {
          // ignore — error already shown
        }
        return
      }
      setOrder(applyPending(data.order))
    } catch {
      setError(i18n.errors.network)
    }
  }

  // Flush all pending quantity changes now (used before submitting).
  async function flushPending() {
    for (const t of syncTimers.current.values()) clearTimeout(t)
    syncTimers.current.clear()
    for (const pid of pendingQty.current.keys()) void queueSync(pid)
    await Promise.all([...syncChains.current.values()])
  }

  async function submit() {
    setSubmitting(true)
    setError(null)
    try {
      // Make sure every optimistic change reached the server first.
      await flushPending()
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
    <main className="min-h-screen bg-gray-50">
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
                </div>
                <div className="flex flex-col items-center justify-center gap-1">
                  <QtyStepper
                    qty={item.qtyOrdered}
                    onChange={(q) => changeQty(item.productId, q)}
                    size="sm"
                  />
                  <button
                    onClick={() => changeQty(item.productId, 0)}
                    className="text-xs text-gray-400 hover:text-red-500"
                  >
                    {i18n.catalog.remove}
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="sticky bottom-0 z-40 bg-white border-t border-gray-200 px-4 py-4 shadow-lg pb-safe">
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
