'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { i18n } from '@/lib/i18n'
import { formatPrice, formatTotal } from '@/lib/format'
import { AnnouncementBanner } from '@/components/AnnouncementBanner'
import { QtyStepper } from '@/components/QtyStepper'

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
  const [savingFor, setSavingFor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null)
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map())
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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

      <AnnouncementBanner />

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
                  saving={savingFor === p.id}
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
                    saving={savingFor === p.id}
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
            <div className="text-gray-500">{formatTotal(order.totalAgorot)}</div>
          </div>
          <button
            onClick={() => router.push('/cart')}
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
  saving,
}: {
  product: Product
  qty: number
  onChange: (qty: number) => void
  saving: boolean
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
      <div className="text-base font-semibold text-gray-900 leading-tight mb-1 line-clamp-2 min-h-[2.5rem]">
        {product.name}
      </div>
      <div className="text-xs text-gray-400 font-mono mb-1 truncate" dir="ltr">
        {product.barcode}
      </div>
      <div className="text-base font-bold text-primary mb-2 whitespace-nowrap">
        {formatPrice(product.priceAgorot)}
      </div>
      <QtyControl qty={qty} onChange={onChange} saving={saving} disabled={isOOS} />
    </div>
  )
}

function QtyControl({
  qty,
  onChange,
  saving,
  disabled,
}: {
  qty: number
  onChange: (qty: number) => void
  saving: boolean
  disabled?: boolean
}) {
  if (qty === 0) {
    return (
      <button
        onClick={() => onChange(1)}
        disabled={saving || disabled}
        className="w-full py-2 bg-primary text-white rounded-lg font-medium text-sm disabled:opacity-50 active:bg-red-700"
      >
        {saving ? '…' : i18n.catalog.addToCart}
      </button>
    )
  }
  return (
    <QtyStepper qty={qty} onChange={onChange} saving={saving} disabled={disabled} />
  )
}
