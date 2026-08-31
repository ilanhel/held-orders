'use client'

import { useEffect, useMemo, useRef, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { i18n, type OrderStatusKey } from '@/lib/i18n'
import { formatPrice, formatTotal } from '@/lib/format'
import { sortForPicking } from '@/lib/pick-order'

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
  warehouseMark: 'YELLOW' | 'GREEN' | null
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
  // In-screen confirmation instead of window.confirm — iOS Safari/PWA can
  // silently suppress native confirm dialogs, making the button appear dead.
  const [confirming, setConfirming] = useState<'finish' | 'cancel' | null>(null)
  // Picked rows drop to a collapsed "picked" section at the bottom — but only
  // after a short hold, so the row doesn't jump away under the picker's hand.
  const [heldIds, setHeldIds] = useState<Set<string>>(new Set())
  const [showPicked, setShowPicked] = useState(false)
  const holdTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  function holdInPlace(itemId: string) {
    setHeldIds((prev) => new Set(prev).add(itemId))
    const timers = holdTimersRef.current
    const existing = timers.get(itemId)
    if (existing) clearTimeout(existing)
    timers.set(
      itemId,
      setTimeout(() => {
        timers.delete(itemId)
        setHeldIds((prev) => {
          const next = new Set(prev)
          next.delete(itemId)
          return next
        })
      }, 2000)
    )
  }

  useEffect(() => {
    const timers = holdTimersRef.current
    return () => {
      for (const t of timers.values()) clearTimeout(t)
    }
  }, [])

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

  // Optimistic marker toggle (YELLOW = waiting for production, GREEN = invoiced).
  async function setMark(mark: 'YELLOW' | 'GREEN' | null) {
    const prev = order?.warehouseMark ?? null
    setOrder((o) => (o ? { ...o, warehouseMark: mark } : o))
    try {
      const res = await fetch(`/api/orders/${id}/mark`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mark }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data?.error?.message ?? i18n.errors.serverError)
        setOrder((o) => (o ? { ...o, warehouseMark: prev } : o))
      }
    } catch {
      setError(i18n.errors.network)
      setOrder((o) => (o ? { ...o, warehouseMark: prev } : o))
    }
  }

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

  // Optimistic item updates: patch local state immediately, debounce the PUT
  // per item, and never disable the row controls while a save is in flight —
  // otherwise quick taps on +/- get swallowed on slow warehouse wifi.
  const pendingRef = useRef(new Map<string, { qtySupplied: number; picked: boolean }>())
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const chainsRef = useRef(new Map<string, Promise<void>>())

  function applyPending(serverOrder: Order): Order {
    const pending = pendingRef.current
    if (pending.size === 0) return serverOrder
    return {
      ...serverOrder,
      items: serverOrder.items.map((i) =>
        pending.has(i.id) ? { ...i, ...pending.get(i.id)! } : i
      ),
    }
  }

  function changeItem(item: OrderItem, qtySupplied: number, picked: boolean) {
    // Newly picked rows stay in place briefly before dropping to the bottom
    // section; un-picking brings the row back to the main list immediately.
    if (picked && !item.picked) holdInPlace(item.id)
    setOrder((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((i) =>
              i.id === item.id ? { ...i, qtySupplied, picked } : i
            ),
          }
        : prev
    )
    pendingRef.current.set(item.id, { qtySupplied, picked })
    const timers = timersRef.current
    const existing = timers.get(item.id)
    if (existing) clearTimeout(existing)
    timers.set(
      item.id,
      setTimeout(() => {
        timers.delete(item.id)
        queueSync(item.id)
      }, 300)
    )
  }

  function queueSync(itemId: string) {
    const chain = chainsRef.current.get(itemId) ?? Promise.resolve()
    chainsRef.current.set(
      itemId,
      chain.then(() => doSync(itemId))
    )
  }

  async function doSync(itemId: string) {
    const payload = pendingRef.current.get(itemId)
    if (!payload) return
    pendingRef.current.delete(itemId)
    try {
      const res = await fetch(`/api/orders/${id}/items/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error?.message ?? i18n.errors.serverError)
        await load() // refetch server truth after a rejected update
      } else {
        setOrder(applyPending(data.order))
      }
    } catch {
      setError(i18n.errors.network)
    }
  }

  async function flushPending() {
    for (const itemId of [...pendingRef.current.keys()]) {
      const timer = timersRef.current.get(itemId)
      if (timer) {
        clearTimeout(timer)
        timersRef.current.delete(itemId)
        queueSync(itemId)
      }
    }
    await Promise.all([...chainsRef.current.values()])
  }

  async function transitionTo(status: OrderStatusKey) {
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      await flushPending()
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
    setConfirming(null)
    await transitionTo('CANCELLED')
  }

  async function finishAndSend() {
    setConfirming(null)
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      await flushPending()
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
            {i18n.orders.statuses[order.status]}
          </div>
          {order.submittedAt && (
            <div className="text-base font-bold text-gray-800 mt-1">
              📅 {new Date(order.submittedAt).toLocaleString('he-IL')}
            </div>
          )}
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => void setMark(order.warehouseMark === 'YELLOW' ? null : 'YELLOW')}
              className={`flex-1 min-h-[44px] rounded-lg border text-sm font-semibold px-2 py-2 ${
                order.warehouseMark === 'YELLOW'
                  ? 'bg-yellow-400 border-yellow-500 text-yellow-950'
                  : 'bg-white border-gray-300 text-gray-600'
              }`}
            >
              🟡 {i18n.warehouse.mark.yellow}
            </button>
            <button
              onClick={() => void setMark(order.warehouseMark === 'GREEN' ? null : 'GREEN')}
              className={`flex-1 min-h-[44px] rounded-lg border text-sm font-semibold px-2 py-2 ${
                order.warehouseMark === 'GREEN'
                  ? 'bg-green-500 border-green-600 text-white'
                  : 'bg-white border-gray-300 text-gray-600'
              }`}
            >
              🟢 {i18n.warehouse.mark.green}
            </button>
          </div>
        </div>

        <PickList
          items={order.items}
          heldIds={heldIds}
          isPickable={!!isPickable}
          showPicked={showPicked}
          onToggleShowPicked={() => setShowPicked((v) => !v)}
          onUpdate={changeItem}
        />
      </section>

      <div className="sticky bottom-0 z-40 bg-white border-t border-gray-200 px-4 py-3 space-y-2 pb-safe shadow-lg">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">{i18n.orders.total}</span>
          <span className="font-bold text-primary">{formatTotal(order.totalAgorot)}</span>
        </div>

        {confirming === 'finish' && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg space-y-2">
            <p className="text-sm text-green-900 text-center">
              {i18n.warehouse.pick.confirmFinish}
            </p>
            <div className="flex gap-2">
              <button
                onClick={finishAndSend}
                disabled={busy}
                className="flex-1 bg-green-600 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50 active:bg-green-700"
              >
                {i18n.common.confirm}
              </button>
              <button
                onClick={() => setConfirming(null)}
                disabled={busy}
                className="flex-1 bg-white border border-gray-300 text-gray-700 py-2.5 rounded-lg disabled:opacity-50"
              >
                {i18n.common.cancel}
              </button>
            </div>
          </div>
        )}

        {confirming === 'cancel' && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg space-y-2">
            <p className="text-sm text-red-900 text-center">
              {i18n.warehouse.actions.confirmCancel}
            </p>
            <div className="flex gap-2">
              <button
                onClick={cancelOrder}
                disabled={busy}
                className="flex-1 bg-red-600 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50 active:bg-red-700"
              >
                {i18n.common.confirm}
              </button>
              <button
                onClick={() => setConfirming(null)}
                disabled={busy}
                className="flex-1 bg-white border border-gray-300 text-gray-700 py-2.5 rounded-lg disabled:opacity-50"
              >
                {i18n.common.cancel}
              </button>
            </div>
          </div>
        )}

        {isPickable && confirming === null && (
          <button
            onClick={() => setConfirming('finish')}
            disabled={busy}
            className="w-full bg-green-600 text-white font-semibold py-3 rounded-lg disabled:opacity-50 active:bg-green-700"
          >
            📲 {i18n.warehouse.pick.finishAndSend}
            {totalShortages > 0 ? ` · ${totalShortages} ${i18n.warehouse.pick.shortagesLabel}` : ''}
          </button>
        )}

        {nextAction && confirming === null && (
          <button
            onClick={() => transitionTo(nextAction.status)}
            disabled={busy}
            className="w-full bg-primary text-white font-semibold py-3 rounded-lg disabled:opacity-50 active:bg-red-700"
          >
            {nextAction.label}
          </button>
        )}

        {order.status !== 'SHIPPED' && order.status !== 'CANCELLED' && confirming === null && (
          <button
            onClick={() => setConfirming('cancel')}
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

function PickList({
  items,
  heldIds,
  isPickable,
  showPicked,
  onToggleShowPicked,
  onUpdate,
}: {
  items: OrderItem[]
  heldIds: Set<string>
  isPickable: boolean
  showPicked: boolean
  onToggleShowPicked: () => void
  onUpdate: (item: OrderItem, qtySupplied: number, picked: boolean) => void
}) {
  const sorted = sortForPicking(items)
  // A picked row is "settled" (moved to the bottom section) only after its
  // short in-place hold expired.
  const remaining = sorted.filter((i) => !i.picked || heldIds.has(i.id))
  const settled = sorted.filter((i) => i.picked && !heldIds.has(i.id))

  return (
    <>
      <h2 className="font-semibold text-gray-700 mb-2">
        {settled.length > 0
          ? remaining.length > 0
            ? `${i18n.warehouse.pick.remainingLabel}: ${remaining.length} / ${items.length}`
            : i18n.warehouse.pick.allPicked
          : `${items.length} ${i18n.orders.items}`}
      </h2>
      <ul className="space-y-2">
        {remaining.map((item) => (
          <PickRow
            key={item.id}
            item={item}
            disabled={!isPickable}
            onUpdate={(qty, picked) => onUpdate(item, qty, picked)}
          />
        ))}
      </ul>

      {settled.length > 0 && (
        <div className="mt-4">
          <button
            onClick={onToggleShowPicked}
            className="w-full flex items-center justify-between bg-green-100 border border-green-300 rounded-xl px-4 py-3 text-green-900 font-semibold"
          >
            <span>
              ✔ {i18n.warehouse.pick.pickedSection} ({settled.length})
            </span>
            <span className="text-green-700">{showPicked ? '▲' : '▼'}</span>
          </button>
          {showPicked && (
            <ul className="space-y-2 mt-2 opacity-60">
              {settled.map((item) => (
                <PickRow
                  key={item.id}
                  item={item}
                  disabled={!isPickable}
                  dimmed
                  onUpdate={(qty, picked) => onUpdate(item, qty, picked)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  )
}

function PickRow({
  item,
  disabled,
  dimmed = false,
  onUpdate,
}: {
  item: OrderItem
  disabled: boolean
  dimmed?: boolean
  onUpdate: (qtySupplied: number, picked: boolean) => void
}) {
  const supplied = item.qtySupplied ?? item.qtyOrdered
  const isPartial = item.qtySupplied !== null && item.qtySupplied < item.qtyOrdered
  // Local draft so the field can be cleared/typed into freely; null = follow `supplied`.
  const [draft, setDraft] = useState<string | null>(null)

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
          <div
            className={`font-semibold ${
              dimmed ? 'text-gray-500 line-through decoration-green-600/60' : 'text-gray-900'
            }`}
          >
            {item.productName}
          </div>
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
            onClick={() => {
              setDraft(null)
              // Qty changes never toggle picked — only the checkbox does.
              onUpdate(Math.max(0, supplied - 1), item.picked)
            }}
            disabled={disabled || supplied <= 0}
            className="w-11 h-11 rounded-lg border border-gray-300 text-xl font-bold text-gray-700 disabled:opacity-40 active:bg-gray-100"
            aria-label="−"
          >
            −
          </button>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={draft ?? String(supplied)}
            onFocus={(e) => e.target.select()}
            onChange={(e) => {
              const raw = e.target.value.replace(/[^0-9]/g, '')
              if (raw === '') {
                // Let the user clear the field while typing — don't commit yet.
                setDraft('')
                return
              }
              const n = Math.max(0, Math.min(item.qtyOrdered, parseInt(raw, 10)))
              setDraft(String(n))
              onUpdate(n, item.picked)
            }}
            onBlur={() => setDraft(null)}
            disabled={disabled}
            className="w-16 h-11 px-1 border border-gray-300 rounded-lg text-center text-lg font-semibold"
          />
          <button
            onClick={() => {
              setDraft(null)
              onUpdate(Math.min(item.qtyOrdered, supplied + 1), item.picked)
            }}
            disabled={disabled || supplied >= item.qtyOrdered}
            className="w-11 h-11 rounded-lg border border-gray-300 text-xl font-bold text-gray-700 disabled:opacity-40 active:bg-gray-100"
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
