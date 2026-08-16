'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { i18n } from '@/lib/i18n'
import { AnnouncementBanner } from '@/components/AnnouncementBanner'
import { QtyStepper } from '@/components/QtyStepper'
import { PushOptIn } from '@/components/PushOptIn'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
// Exponential backoff capped at 8s: 0.5s, 1s, 2s, 4s...
const backoffMs = (attempt: number) => Math.min(500 * 2 ** (attempt - 1), 8000)

type Product = {
  id: string
  name: string
  barcode: string
  categoryId: string
  priceAgorot: number
  imagePath: string | null
  status: 'ACTIVE' | 'OUT_OF_STOCK' | 'HIDDEN'
}

type Category = {
  id: string
  name: string
  sortOrder: number
  products: Product[]
}

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

export default function CatalogPage() {
  const router = useRouter()
  const [categories, setCategories] = useState<Category[]>([])
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Product[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null)
  const [reordering, setReordering] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [pendingSync, setPendingSync] = useState(false)
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map())
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Optimistic-update bookkeeping: latest desired qty per product not yet
  // confirmed by the server, per-product debounce timers, and per-product
  // promise chains that serialize the background PUTs.
  const pendingQty = useRef<Map<string, number>>(new Map())
  const syncTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const syncChains = useRef<Map<string, Promise<void>>>(new Map())
  // Initial load: catalog + draft
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [catRes, draftRes] = await Promise.all([
          fetch('/api/catalog'),
          fetch('/api/orders/draft'),
        ])
        if (catRes.status === 401 || draftRes.status === 401) {
          router.push('/login')
          return
        }
        const catData = await catRes.json()
        const draftData = await draftRes.json()
        if (cancelled) return
        setCategories(catData.categories ?? [])
        setOrder(draftData.order ?? null)
        if (catData.categories?.[0]) setActiveCategoryId(catData.categories[0].id)
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

  // Debounced search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    const q = searchQuery.trim()
    if (q.length === 0) {
      setSearchResults(null)
      return
    }
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/catalog/search?q=${encodeURIComponent(q)}`)
        if (!res.ok) return
        const data = await res.json()
        setSearchResults(data.products ?? [])
      } catch {
        // ignore search errors
      }
    }, 200)
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current)
    }
  }, [searchQuery])

  const cartMap = useMemo(() => {
    const m = new Map<string, number>()
    if (order) for (const it of order.items) m.set(it.productId, it.qtyOrdered)
    return m
  }, [order])

  const totalQty = useMemo(
    () => Array.from(cartMap.values()).reduce((s, n) => s + n, 0),
    [cartMap]
  )

  async function changeQty(productId: string, qty: number) {
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

  function findProduct(productId: string): Product | undefined {
    for (const c of categories) {
      const p = c.products.find((x) => x.id === productId)
      if (p) return p
    }
    return searchResults?.find((x) => x.id === productId)
  }

  // Return a copy of the order with the given product set to qty (added,
  // updated or removed) and the total recomputed.
  function patchOrder(o: Order | null, productId: string, qty: number): Order | null {
    const base: Order =
      o ?? { id: '', number: null, status: 'DRAFT', items: [], totalAgorot: 0 }
    const idx = base.items.findIndex((it) => it.productId === productId)
    let items: OrderItem[]
    if (qty <= 0) {
      if (idx === -1) return o
      items = base.items.filter((it) => it.productId !== productId)
    } else if (idx === -1) {
      const p = findProduct(productId)
      if (!p) return o
      items = [
        ...base.items,
        {
          id: `local-${productId}`,
          productId,
          productName: p.name,
          productBarcode: p.barcode,
          priceAgorot: p.priceAgorot,
          qtyOrdered: qty,
        },
      ]
    } else {
      items = base.items.map((it) =>
        it.productId === productId ? { ...it, qtyOrdered: qty } : it
      )
    }
    const totalAgorot = items.reduce((s, it) => s + it.priceAgorot * it.qtyOrdered, 0)
    return { ...base, items, totalAgorot }
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

    const maxAttempts = 5
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await fetch('/api/orders/draft/items', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId, qty }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          // 5xx → transient, retry; 4xx → a real error, stop.
          if (res.status >= 500 && attempt < maxAttempts) {
            setPendingSync(true)
            await sleep(backoffMs(attempt))
            continue
          }
          setError(data?.error?.message ?? i18n.errors.serverError)
          setPendingSync(false)
          if (pendingQty.current.get(productId) === qty)
            pendingQty.current.delete(productId)
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
        setPendingSync(false)
        if (pendingQty.current.get(productId) === qty)
          pendingQty.current.delete(productId)
        setOrder(applyPending(data.order))
        return
      } catch {
        // Network failure (offline / dropped connection) → retry with backoff.
        if (attempt < maxAttempts) {
          setPendingSync(true)
          await sleep(backoffMs(attempt))
          continue
        }
        // Keep the pending value — it will be retried on the next change/flush.
        setError(i18n.errors.network)
        setPendingSync(false)
        return
      }
    }
  }

  // Flush all pending quantity changes now (used before leaving to the cart).
  async function flushPending() {
    for (const t of syncTimers.current.values()) clearTimeout(t)
    syncTimers.current.clear()
    for (const pid of pendingQty.current.keys()) void queueSync(pid)
    await Promise.all([...syncChains.current.values()])
  }

  function scrollToCategory(id: string) {
    const el = sectionRefs.current.get(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setActiveCategoryId(id)
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  async function reorderLast() {
    setReordering(true)
    setToast(null)
    try {
      const res = await fetch('/api/orders/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (res.status === 401) {
        router.push('/login')
        return
      }
      if (!res.ok) {
        setToast(
          data?.error?.code === 'NO_PREVIOUS_ORDER'
            ? i18n.orders.noPreviousOrder
            : data?.error?.message ?? i18n.errors.serverError
        )
        return
      }
      setOrder(data.draft)
      setToast(data.skipped > 0 ? i18n.orders.reorderSkipped : i18n.orders.reorderDone)
    } catch {
      setToast(i18n.errors.network)
    } finally {
      setReordering(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">{i18n.common.loading}</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-32">
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <h1 className="text-xl font-bold text-primary flex-shrink-0">
          {i18n.app.name}
        </h1>
        <input
          type="search"
          placeholder={i18n.catalog.search}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-lg text-base"
        />
        <button
          onClick={logout}
          className="text-sm text-gray-500 hover:text-gray-700 flex-shrink-0"
        >
          {i18n.auth.logout}
        </button>
      </header>

      {/* Quick actions: my orders + regular order */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-2">
        <button
          onClick={() => router.push('/orders')}
          className="text-sm font-medium text-gray-700 border border-gray-300 rounded-lg px-3 py-1.5"
        >
          📋 {i18n.orders.myOrders}
        </button>
        <button
          onClick={() => router.push('/scan')}
          className="text-sm font-medium text-gray-700 border border-gray-300 rounded-lg px-3 py-1.5"
        >
          📷 {i18n.scan.open}
        </button>
        <button
          onClick={reorderLast}
          disabled={reordering}
          className="text-sm font-medium text-primary border border-primary rounded-lg px-3 py-1.5 disabled:opacity-60"
        >
          🔁 {reordering ? i18n.orders.reordering : i18n.orders.regularOrder}
        </button>
      </div>

      {toast && (
        <div className="mx-4 mt-3 p-3 bg-blue-50 border border-blue-200 text-blue-800 rounded-lg text-sm text-center">
          {toast}
        </div>
      )}

      {pendingSync && (
        <div className="sticky top-[64px] z-20 mx-4 mt-3 p-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-sm text-center flex items-center justify-center gap-2">
          <span className="inline-block w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          {i18n.common.waitingForConnection}
        </div>
      )}

      <AnnouncementBanner />

      <div className="px-4 pt-3">
        <PushOptIn />
      </div>

      {/* Category nav */}
      {!searchResults && categories.length > 0 && (
        <nav className="sticky top-[64px] z-20 bg-white border-b border-gray-200 overflow-x-auto">
          <ul className="flex gap-2 px-4 py-2 whitespace-nowrap">
            {categories.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => scrollToCategory(c.id)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
                    activeCategoryId === c.id
                      ? 'bg-primary text-white'
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {c.name}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Search results */}
      {searchResults && (
        <section className="px-4 py-4">
          <h2 className="text-lg font-semibold mb-3 text-gray-800">
            תוצאות חיפוש ({searchResults.length})
          </h2>
          {searchResults.length === 0 ? (
            <p className="text-gray-500 text-center py-10">{i18n.catalog.noResults}</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {searchResults.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  qty={cartMap.get(p.id) ?? 0}
                  onChange={(q) => changeQty(p.id, q)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Catalog by category */}
      {!searchResults &&
        categories.map((c) => (
          <section
            key={c.id}
            id={`cat-${c.id}`}
            ref={(el) => {
              if (el) sectionRefs.current.set(c.id, el)
            }}
            className="px-4 pt-6 pb-2 scroll-mt-32"
          >
            <h2 className="text-lg font-bold text-gray-800 mb-3">{c.name}</h2>
            {c.products.length === 0 ? (
              <p className="text-gray-500 text-sm">{i18n.catalog.noProducts}</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {c.products.map((p) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    qty={cartMap.get(p.id) ?? 0}
                    onChange={(q) => changeQty(p.id, q)}
                  />
                ))}
              </div>
            )}
          </section>
        ))}

      {/* Floating cart bar */}
      {order && totalQty > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-between gap-3 shadow-lg pb-safe">
          <div className="text-sm text-gray-700">
            <div className="font-semibold">{totalQty} {i18n.orders.items}</div>
          </div>
          <button
            onClick={async () => {
              await flushPending()
              router.push('/cart')
            }}
            className="bg-primary text-white font-semibold px-6 py-3 rounded-lg active:bg-red-700"
          >
            {i18n.orders.cart} ←
          </button>
        </div>
      )}
    </main>
  )
}

function ProductCard({
  product,
  qty,
  onChange,
}: {
  product: Product
  qty: number
  onChange: (qty: number) => void
}) {
  const isOOS = product.status === 'OUT_OF_STOCK'
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 flex flex-col">
      <div className="aspect-square bg-gray-100 rounded-lg mb-2 flex items-center justify-center overflow-hidden relative">
        {product.imagePath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imagePath}
            alt={product.name}
            loading="lazy"
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-gray-300 text-3xl">📦</span>
        )}
        {isOOS && (
          <span className="absolute top-2 right-2 bg-gray-800 text-white text-xs px-2 py-0.5 rounded">
            {i18n.catalog.outOfStock}
          </span>
        )}
      </div>
      <div className="text-sm font-semibold text-gray-900 leading-snug mb-1 min-h-[2.5rem] break-words">
        {product.name}
      </div>
      <div className="text-xs text-gray-400 font-mono mb-2 truncate" dir="ltr">
        {product.barcode}
      </div>
      <div className="mt-auto">
        <QtyStepper qty={qty} onChange={onChange} disabled={isOOS} />
      </div>
    </div>
  )
}
