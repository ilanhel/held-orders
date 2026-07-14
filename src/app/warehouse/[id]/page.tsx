'use client'

import { useEffect, useMemo, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { i18n, type OrderStatusKey } from '@/lib/i18n'
import { formatPrice, formatTotal } from '@/lib/format'

type OrderItem = {
  id: string
  productId: string
  productName: string
  productBarcode: string
  priceAgorot: number
  qtyOrdered: number
  qtySupplied: number | null
  picked: boolean
}

type Order = {
  id: string
  number: number | null
  storeName: string
  status: OrderStatusKey
  submittedAt: string | null
  items: OrderItem[]
  totalAgorot: number
}

const NEXT_STATUS_LABEL: Partial<Record<OrderStatusKey, { label: string; status: OrderStatusKey }>> = {
  SUBMITTED: { label: 'סימון התקבלה', status: 'RECEIVED' },
  RECEIVED: { label: 'התחל ליקוט', status: 'PICKING' },
  PICKING: { label: 'סימון מוכן', status: 'READY' },
  READY: { label: 'סימון נשלח', status: 'SHIPPED' },
}

export default function WarehouseOrderPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    try {
      const res = await fetch(`/api/orders/${id}`)
      if (res.status === 401) {
        router.push('/login')
        return
      }
      const data = await res.json()
      if (!res.ok) setError(data?.error?.message ?? i18n.errors.serverError)
      else setOrder(data.order)
    } catch {
      setError(i18n.errors.network)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const isPickable =
    order?.status === 'SUBMITTED' ||
    order?.status === 'RECEIVED' ||
    order?.status === 'PICKING'

  const totalShortages = useMemo(() => {
    if (!order) return 0
    return order.items.filter(
      (i) => i.qtySupplied !== null && i.qtySupplied < i.qtyOrdered
    ).length
  }, [order])

  async function updateItem(item: OrderItem, qtySupplied: number, picked: boolean) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/orders/${id}/items/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qtySupplied, picked }),
      })
      const data = await res.json()
      if (!res.ok) setError(data?.error?.message ?? i18n.errors.serverError)
      else setOrder(data.order)
    } catch {
      setError(i18n.errors.network)
    } finally {
      setBusy(false)
    }
  }

  async function transitionTo(status: OrderStatusKey) {
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      const res = await fetch(`/api/orders/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await res.json()
      if (!res.ok) setError(data?.error?.message ?? i18n.errors.serverError)
      else setOrder(data.order)
    } catch {
      setError(i18n.errors.network)
    } finally {
      setBusy(false)
    }
  }

  async function cancelOrder() {
    if (!confirm(i18n.warehouse.actions.confirmCancel)) return
    await transitionTo('CANCELLED')
  }

  async function finishAndSend() {
    if (!confirm(i18n.warehouse.pick.confirmFinish)) return
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      const res = await fetch(`/api/orders/${id}/finish-picking`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error?.message ?? i18n.errors.serverError)
      } else {
        const parts: string[] = []
        parts.push(
          data.shortageCount > 0
            ? `${i18n.warehouse.pick.shortagesSentTo} (${data.shortageCount})`
            : i18n.warehouse.pick.noShortages
        )
        if (data.erpSent) parts.push(i18n.warehouse.pick.erpSent)
        setInfo(parts.join(' · '))
      }
    } catch {
      setError(i18n.errors.network)
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">{i18n.common.loading}</p>
      </main>
    )
  }
  if (!order) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <p className="text-red-600">{error ?? i18n.errors.notFound}</p>
      </main>
    )
  }

  const nextAction = NEXT_STATUS_LABEL[order.status]

  // Group items by category — for picking ergonomics we just list them, since
  // catalog already grouped products; warehouse view is order-line oriented.
  return (
    <main className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.push('/warehouse')} className="text-gray-500 text-sm">
          → {i18n.common.back}
        </button>
        <h1 className="text-xl font-bold flex-1 text-center">
          #{order.number ?? '—'}
        </h1>
        <span className="w-10" />
      </header>

      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}
      {info && (
        <div className="mx-4 mt-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
          {info}
        </div>
      )}

      <section className="px-4 pt-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <div className="font-semibold text-gray-900">{order.storeName}</div>
          <div className="text-xs text-gray-500 mt-1">
            {i18n.orders.statuses[order.status]} ·{' '}
            {order.submittedAt && new Date(order.submittedAt).toLocaleString('he-IL')}
          </div>
        </div>

        <h2 className="font-semibold text-gray-700 mb-2">
          {order.items.length} {i18n.orders.items}
        </h2>
        <ul className="space-y-2">
          {order.items.map((item) => (
            <PickRow
              key={item.id}
              item={item}
              disabled={busy || !isPickable}
              onUpdate={(qty, picked) => updateItem(item, qty, picked)}
            />
          ))}
        </ul>
      </section>

      <div className="sticky bottom-0 z-40 bg-white border-t border-gray-200 px-4 py-3 space-y-2 pb-safe shadow-lg">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">{i18n.orders.total}</span>
          <span className="font-bold text-primary">{formatTotal(order.totalAgorot)}</span>
        </div>

        {isPickable && (
          <button
            onClick={finishAndSend}
            disabled={busy}
            className="w-full bg-green-600 text-white font-semibold py-3 rounded-lg disabled:opacity-50 active:bg-green-700"
          >
            📲 {i18n.warehouse.pick.finishAndSend}
            {totalShortages > 0 ? ` · ${totalShortages} ${i18n.warehouse.pick.shortagesLabel}` : ''}
          </button>
        )}

        {nextAction && (
          <button
            onClick={() => transitionTo(nextAction.status)}
            disabled={busy}
            className="w-full bg-primary text-white font-semibold py-3 rounded-lg disabled:opacity-50 active:bg-red-700"
          >
            {nextAction.label}
          </button>
        )}

        {order.status !== 'SHIPPED' && order.status !== 'CANCELLED' && (
          <button
            onClick={cancelOrder}
            disabled={busy}
            className="w-full text-red-600 text-sm py-1.5 disabled:opacity-50"
          >
            {i18n.warehouse.actions.cancel}
          </button>
        )}
      </div>
    </main>
  )
}

function PickRow({
  item,
  disabled,
  onUpdate,
}: {
  item: OrderItem
  disabled: boolean
  onUpdate: (qtySupplied: number, picked: boolean) => void
}) {
  const supplied = item.qtySupplied ?? item.qtyOrdered
  const isPartial = item.qtySupplied !== null && item.qtySupplied < item.qtyOrdered

  return (
    <li
      className={`bg-white rounded-xl border p-3 ${
        item.picked ? 'border-green-300 bg-green-50' : 'border-gray-200'
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          onClick={() => onUpdate(supplied, !item.picked)}
          disabled={disabled}
          className={`mt-1 w-7 h-7 rounded-md border-2 flex-shrink-0 flex items-center justify-center ${
            item.picked
              ? 'bg-green-500 border-green-500 text-white'
              : 'bg-white border-gray-300'
          } disabled:opacity-50`}
          aria-label={i18n.warehouse.pick.markPicked}
        >
          {item.picked && '✓'}
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-gray-900">{item.productName}</div>
          <div className="text-xs text-gray-400 font-mono mt-0.5" dir="ltr">
            {item.productBarcode}
          </div>
          <div className="text-sm text-gray-600 mt-1">
            {i18n.orders.qtyOrdered}:{' '}
            <span className="font-bold text-lg text-gray-900">{item.qtyOrdered}</span>{' '}
            · {formatPrice(item.priceAgorot)}
          </div>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600">{i18n.warehouse.pick.qtySupplied}</span>
          <button
            onClick={() => onUpdate(Math.max(0, supplied - 1), true)}
            disabled={disabled || supplied <= 0}
            className="w-9 h-9 rounded-lg border border-gray-300 text-xl font-bold text-gray-700 disabled:opacity-40"
            aria-label="−"
          >
            −
          </button>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={item.qtyOrdered}
            value={supplied}
            onChange={(e) => {
              const n = Math.max(
                0,
                Math.min(item.qtyOrdered, parseInt(e.target.value || '0', 10))
              )
              onUpdate(n, true)
            }}
            disabled={disabled}
            className="w-16 h-9 px-1 border border-gray-300 rounded-lg text-center text-lg font-semibold"
          />
          <button
            onClick={() => onUpdate(Math.min(item.qtyOrdered, supplied + 1), true)}
            disabled={disabled || supplied >= item.qtyOrdered}
            className="w-9 h-9 rounded-lg border border-gray-300 text-xl font-bold text-gray-700 disabled:opacity-40"
            aria-label="+"
          >
            +
          </button>
          <span className="text-sm text-gray-500">/ {item.qtyOrdered}</span>
          {isPartial && (
            <span className="text-xs text-orange-600 font-medium mr-auto">
              {i18n.warehouse.pick.partialOrMissing}
            </span>
          )}
        </div>
      </div>
    </li>
  )
}
