'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { i18n } from '@/lib/i18n'

const t = i18n.admin.settings

type ForwardView = {
  id: string
  name: string
  phone: string
  active: boolean
  products: Array<{ id: string; name: string; barcode: string }>
  categories: Array<{ id: string; name: string }>
}

type ProductOption = { id: string; name: string; barcode: string }
type CategoryOption = { id: string; name: string }

export default function AdminSettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [forwards, setForwards] = useState<ForwardView[]>([])
  const [allProducts, setAllProducts] = useState<ProductOption[]>([])
  const [allCategories, setAllCategories] = useState<CategoryOption[]>([])
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [fwRes, prodRes] = await Promise.all([
          fetch('/api/forwards'),
          fetch('/api/products'),
        ])
        if (fwRes.status === 401 || fwRes.status === 403) {
          router.push('/login')
          return
        }
        const fwData = await fwRes.json()
        const prodData = await prodRes.json()
        if (cancelled) return
        setForwards(fwData.forwards ?? [])
        setAllProducts(
          (prodData.products ?? []).map((p: { id: string; name: string; barcode: string }) => ({
            id: p.id,
            name: p.name,
            barcode: p.barcode,
          }))
        )
        setAllCategories(
          (prodData.categories ?? []).map((c: { id: string; name: string }) => ({
            id: c.id,
            name: c.name,
          }))
        )
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function flash(msg: string) {
    setInfo(msg)
    setError(null)
    setTimeout(() => setInfo(null), 3000)
  }

  async function deleteForward(id: string) {
    if (!window.confirm(t.confirmDelete)) return
    try {
      const res = await fetch(`/api/forwards/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error?.message ?? i18n.errors.serverError)
        return
      }
      setForwards((prev) => prev.filter((f) => f.id !== id))
      flash(t.deleted)
    } catch {
      setError(i18n.errors.network)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen grid place-items-center bg-gray-50">
        <p className="text-gray-500">{i18n.common.loading}</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.push('/admin')} className="text-gray-500 text-sm">
          → {i18n.common.back}
        </button>
        <h1 className="text-xl font-bold flex-1 text-center">{t.title}</h1>
        <span className="w-10" />
      </header>

      <section className="px-4 py-6 max-w-2xl mx-auto">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}
        {info && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
            {info}
          </div>
        )}

        <h2 className="font-bold text-gray-900">🖼️ {t.forwardsTitle}</h2>
        <p className="text-xs text-gray-500 mt-1 mb-4">{t.forwardsHint}</p>

        {forwards.length === 0 && (
          <p className="text-sm text-gray-400 mb-4">{t.empty}</p>
        )}

        <div className="space-y-4">
          {forwards.map((f) => (
            <ForwardCard
              key={f.id}
              forward={f}
              allProducts={allProducts}
              allCategories={allCategories}
              onSaved={(updated) => {
                setForwards((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
                flash(t.saved)
              }}
              onDelete={() => void deleteForward(f.id)}
              onError={setError}
            />
          ))}
        </div>

        <NewForwardForm
          onCreated={(created) => {
            setForwards((prev) => [...prev, created])
            flash(t.created)
          }}
          onError={setError}
        />
      </section>
    </main>
  )
}

function ForwardCard({
  forward,
  allProducts,
  allCategories,
  onSaved,
  onDelete,
  onError,
}: {
  forward: ForwardView
  allProducts: ProductOption[]
  allCategories: CategoryOption[]
  onSaved: (f: ForwardView) => void
  onDelete: () => void
  onError: (msg: string) => void
}) {
  const [name, setName] = useState(forward.name)
  const [phone, setPhone] = useState(forward.phone)
  const [active, setActive] = useState(forward.active)
  const [categoryIds, setCategoryIds] = useState<Set<string>>(
    new Set(forward.categories.map((c) => c.id))
  )
  const [productIds, setProductIds] = useState<Set<string>>(
    new Set(forward.products.map((p) => p.id))
  )
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)

  const productById = useMemo(
    () => new Map(allProducts.map((p) => [p.id, p])),
    [allProducts]
  )

  const searchResults = useMemo(() => {
    const q = search.trim()
    if (!q) return []
    const lower = q.toLowerCase()
    return allProducts
      .filter(
        (p) =>
          !productIds.has(p.id) &&
          (p.name.toLowerCase().includes(lower) || p.barcode.includes(q))
      )
      .slice(0, 15)
  }, [search, allProducts, productIds])

  function toggleCategory(id: string) {
    setCategoryIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/forwards/${forward.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          active,
          productIds: [...productIds],
          categoryIds: [...categoryIds],
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        onError(data.error?.message ?? i18n.errors.serverError)
        return
      }
      onSaved(data.forward)
    } catch {
      onError(i18n.errors.network)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-4 ${active ? '' : 'opacity-70'}`}>
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 min-w-[140px] border border-gray-300 rounded-lg px-3 py-2 font-semibold"
          placeholder={t.namePlaceholder}
        />
        <input
          type="text"
          inputMode="tel"
          dir="ltr"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-44 border border-gray-300 rounded-lg px-3 py-2 text-left"
          placeholder={t.phonePlaceholder}
        />
        <button
          onClick={() => setActive((a) => !a)}
          className={`rounded-lg px-3 py-2 text-sm font-semibold border ${
            active
              ? 'bg-green-50 border-green-300 text-green-700'
              : 'bg-gray-100 border-gray-300 text-gray-500'
          }`}
        >
          {active ? t.active : t.inactive}
        </button>
        <button onClick={onDelete} className="text-red-600 text-sm px-2 py-2">
          {t.delete}
        </button>
      </div>

      <div className="mt-4">
        <div className="text-sm font-semibold text-gray-700 mb-2">{t.categories}</div>
        <div className="flex flex-wrap gap-1.5">
          {allCategories.map((c) => (
            <button
              key={c.id}
              onClick={() => toggleCategory(c.id)}
              className={`rounded-full px-3 py-1 text-xs border ${
                categoryIds.has(c.id)
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-gray-600 border-gray-300'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <div className="text-sm font-semibold text-gray-700 mb-2">{t.products}</div>
        {productIds.size === 0 ? (
          <p className="text-xs text-gray-400 mb-2">{t.noProducts}</p>
        ) : (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {[...productIds].map((id) => {
              const p = productById.get(id)
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 bg-blue-50 border border-blue-200 text-blue-800 rounded-full px-3 py-1 text-xs"
                >
                  {p ? p.name : id}
                  <button
                    onClick={() =>
                      setProductIds((prev) => {
                        const next = new Set(prev)
                        next.delete(id)
                        return next
                      })
                    }
                    className="text-blue-500 font-bold"
                    aria-label={t.delete}
                  >
                    ✕
                  </button>
                </span>
              )
            })}
          </div>
        )}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t.productSearch}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        {searchResults.length > 0 && (
          <ul className="mt-1 border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-56 overflow-y-auto bg-white">
            {searchResults.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => {
                    setProductIds((prev) => new Set(prev).add(p.id))
                    setSearch('')
                  }}
                  className="w-full text-right px-3 py-2 text-sm hover:bg-gray-50"
                >
                  {p.name}
                  <span className="text-xs text-gray-400 mr-2" dir="ltr">
                    {p.barcode}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        onClick={() => void save()}
        disabled={saving}
        className="mt-4 w-full min-h-[44px] bg-primary text-white rounded-lg font-semibold hover:opacity-90 disabled:opacity-50"
      >
        {saving ? t.saving : t.save}
      </button>
    </div>
  )
}

function NewForwardForm({
  onCreated,
  onError,
}: {
  onCreated: (f: ForwardView) => void
  onError: (msg: string) => void
}) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)

  async function create() {
    if (!name.trim() || !phone.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/forwards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        onError(data.error?.message ?? i18n.errors.serverError)
        return
      }
      onCreated(data.forward)
      setName('')
      setPhone('')
    } catch {
      onError(i18n.errors.network)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-6 bg-white rounded-xl border border-dashed border-gray-300 p-4">
      <div className="text-sm font-semibold text-gray-700 mb-2">➕ {t.newForward}</div>
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t.namePlaceholder}
          className="flex-1 min-w-[140px] border border-gray-300 rounded-lg px-3 py-2"
        />
        <input
          type="text"
          inputMode="tel"
          dir="ltr"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={t.phonePlaceholder}
          className="w-44 border border-gray-300 rounded-lg px-3 py-2 text-left"
        />
        <button
          onClick={() => void create()}
          disabled={saving || !name.trim() || !phone.trim()}
          className="bg-primary text-white rounded-lg px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
        >
          {saving ? t.saving : t.addForward}
        </button>
      </div>
    </div>
  )
}
