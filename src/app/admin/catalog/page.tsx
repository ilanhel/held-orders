'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { i18n } from '@/lib/i18n'

type ProductStatus = 'ACTIVE' | 'OUT_OF_STOCK' | 'HIDDEN'

type Product = {
  id: string
  name: string
  barcode: string
  categoryId: string
  categoryName: string
  priceAgorot: number
  status: ProductStatus
  stockQty: number
  trackStock: boolean
  imagePath: string | null
}

type Category = { id: string; name: string; sortOrder: number }

const STATUS_COLOR: Record<ProductStatus, string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  OUT_OF_STOCK: 'bg-orange-100 text-orange-800',
  HIDDEN: 'bg-gray-200 text-gray-600',
}

const t = i18n.admin.catalog

export default function AdminCatalogPage() {
  const router = useRouter()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set('search', search.trim())
      if (categoryFilter) params.set('categoryId', categoryFilter)
      if (statusFilter) params.set('status', statusFilter)
      const res = await fetch(`/api/products?${params.toString()}`)
      if (res.status === 401) {
        router.push('/login')
        return
      }
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error?.message ?? i18n.errors.serverError)
      } else {
        setProducts(data.products ?? [])
        setCategories(data.categories ?? [])
        setError(null)
      }
    } catch {
      setError(i18n.errors.network)
    } finally {
      setLoading(false)
    }
  }, [search, categoryFilter, statusFilter, router])

  useEffect(() => {
    const id = setTimeout(() => void load(), 250)
    return () => clearTimeout(id)
  }, [load])

  function flash(msg: string) {
    setMessage(msg)
    setTimeout(() => setMessage(null), 2500)
  }

  async function changeStatus(p: Product, status: ProductStatus) {
    setBusyId(p.id)
    setError(null)
    try {
      const res = await fetch(`/api/products/${p.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error?.message ?? i18n.errors.serverError)
      } else {
        setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, status } : x)))
        flash(t.updated)
      }
    } catch {
      setError(i18n.errors.network)
    } finally {
      setBusyId(null)
    }
  }

  async function savePrice(p: Product, shekels: string) {
    const value = Number(shekels)
    if (!Number.isFinite(value) || value < 0) return
    const priceAgorot = Math.round(value * 100)
    if (priceAgorot === p.priceAgorot) return
    setBusyId(p.id)
    setError(null)
    try {
      const res = await fetch(`/api/products/${p.id}/price`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceAgorot }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error?.message ?? i18n.errors.serverError)
      } else {
        setProducts((prev) =>
          prev.map((x) => (x.id === p.id ? { ...x, priceAgorot } : x))
        )
        flash(t.priceUpdated)
      }
    } catch {
      setError(i18n.errors.network)
    } finally {
      setBusyId(null)
    }
  }

  async function saveStock(p: Product, stockQty: number, trackStock: boolean) {
    if (!Number.isInteger(stockQty) || stockQty < 0) return
    if (stockQty === p.stockQty && trackStock === p.trackStock) return
    setBusyId(p.id)
    setError(null)
    try {
      const res = await fetch(`/api/products/${p.id}/stock`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stockQty, trackStock }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error?.message ?? i18n.errors.serverError)
      } else {
        const updated = data.product as Product
        setProducts((prev) =>
          prev.map((x) =>
            x.id === p.id
              ? { ...x, stockQty: updated.stockQty, trackStock: updated.trackStock, status: updated.status }
              : x
          )
        )
        flash(t.stockUpdated)
      }
    } catch {
      setError(i18n.errors.network)
    } finally {
      setBusyId(null)
    }
  }

  async function uploadImage(p: Product, file: File) {
    setBusyId(p.id)
    setError(null)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch(`/api/products/${p.id}/image`, {
        method: 'POST',
        body,
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error?.message ?? i18n.errors.serverError)
      } else {
        const updated = data.product as Product
        setProducts((prev) =>
          prev.map((x) => (x.id === p.id ? { ...x, imagePath: updated.imagePath } : x))
        )
        flash(t.imageUpdated)
      }
    } catch {
      setError(i18n.errors.network)
    } finally {
      setBusyId(null)
    }
  }

  async function removeImage(p: Product) {
    setBusyId(p.id)
    setError(null)
    try {
      const res = await fetch(`/api/products/${p.id}/image`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error?.message ?? i18n.errors.serverError)
      } else {
        setProducts((prev) =>
          prev.map((x) => (x.id === p.id ? { ...x, imagePath: null } : x))
        )
        flash(t.imageRemoved)
      }
    } catch {
      setError(i18n.errors.network)
    } finally {
      setBusyId(null)
    }
  }

  async function deleteProduct(p: Product) {
    if (!window.confirm(t.confirmDelete)) return
    setBusyId(p.id)
    setError(null)
    try {
      const res = await fetch(`/api/products/${p.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error?.message ?? i18n.errors.serverError)
      } else {
        setProducts((prev) => prev.filter((x) => x.id !== p.id))
        flash(t.deleted)
      }
    } catch {
      setError(i18n.errors.network)
    } finally {
      setBusyId(null)
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => router.push('/admin')}
          className="text-gray-500 hover:text-primary text-lg"
          aria-label="חזרה"
        >
          ›
        </button>
        <h1 className="text-xl font-bold text-primary flex-1">{t.title}</h1>
        <button onClick={logout} className="text-sm text-gray-500">
          {i18n.auth.logout}
        </button>
      </header>

      <section className="px-4 py-4 max-w-4xl mx-auto">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.search}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
          >
            <option value="">{t.allCategories}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
          >
            <option value="">{t.allStatuses}</option>
            {(['ACTIVE', 'OUT_OF_STOCK', 'HIDDEN'] as const).map((s) => (
              <option key={s} value={s}>
                {t.statuses[s]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-gray-500">
            {products.length} {t.productCount}
          </span>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="bg-primary text-white rounded-lg px-4 py-2 text-sm font-semibold hover:opacity-90"
          >
            {showForm ? t.cancel : `+ ${t.newProduct}`}
          </button>
        </div>

        {message && (
          <div className="mb-3 p-2 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm text-center">
            {message}
          </div>
        )}
        {error && (
          <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        {showForm && (
          <NewProductForm
            categories={categories}
            onCancel={() => setShowForm(false)}
            onCreated={() => {
              setShowForm(false)
              flash(t.created)
              // Clear filters so the newly created product is always visible.
              setSearch('')
              setCategoryFilter('')
              setStatusFilter('')
              void load()
            }}
            onError={setError}
          />
        )}

        {loading ? (
          <p className="text-gray-500 py-8 text-center">{i18n.common.loading}</p>
        ) : products.length === 0 ? (
          <p className="text-gray-500 py-12 text-center">{t.noProducts}</p>
        ) : (
          <ul className="space-y-2">
            {products.map((p) => (
              <li
                key={p.id}
                className="bg-white rounded-xl border border-gray-200 p-3 flex flex-col sm:flex-row sm:items-center gap-3"
              >
                <ImageEditor
                  product={p}
                  disabled={busyId === p.id}
                  onUpload={(file) => uploadImage(p, file)}
                  onRemove={() => removeImage(p)}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900">{p.name}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[p.status]}`}
                    >
                      {t.statuses[p.status]}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {p.categoryName} · {p.barcode}
                  </div>
                </div>

                {/* Inline price edit */}
                <PriceEditor
                  product={p}
                  disabled={busyId === p.id}
                  onSave={(v) => savePrice(p, v)}
                />

                {/* Inline stock edit */}
                <StockEditor
                  product={p}
                  disabled={busyId === p.id}
                  onSave={(qty, track) => saveStock(p, qty, track)}
                />

                {/* Status quick actions */}
                <div className="flex gap-1">
                  {p.status !== 'ACTIVE' && (
                    <button
                      onClick={() => changeStatus(p, 'ACTIVE')}
                      disabled={busyId === p.id}
                      className="text-xs px-2 py-1 rounded-md bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50"
                    >
                      {t.markActive}
                    </button>
                  )}
                  {p.status !== 'OUT_OF_STOCK' && (
                    <button
                      onClick={() => changeStatus(p, 'OUT_OF_STOCK')}
                      disabled={busyId === p.id}
                      className="text-xs px-2 py-1 rounded-md bg-orange-50 text-orange-700 hover:bg-orange-100 disabled:opacity-50"
                    >
                      {t.markOutOfStock}
                    </button>
                  )}
                  {p.status !== 'HIDDEN' && (
                    <button
                      onClick={() => changeStatus(p, 'HIDDEN')}
                      disabled={busyId === p.id}
                      className="text-xs px-2 py-1 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50"
                    >
                      {t.markHidden}
                    </button>
                  )}
                  <button
                    onClick={() => deleteProduct(p)}
                    disabled={busyId === p.id}
                    className="text-xs px-2 py-1 rounded-md bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
                  >
                    {busyId === p.id ? t.deleting : t.delete}
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

function PriceEditor({
  product,
  disabled,
  onSave,
}: {
  product: Product
  disabled: boolean
  onSave: (shekels: string) => void
}) {
  const [value, setValue] = useState((product.priceAgorot / 100).toFixed(2))

  useEffect(() => {
    setValue((product.priceAgorot / 100).toFixed(2))
  }, [product.priceAgorot])

  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step={0.01}
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => onSave(value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-sm text-left focus:border-primary focus:outline-none disabled:opacity-50"
        aria-label={t.price}
      />
      <span className="text-xs text-gray-400">₪</span>
    </div>
  )
}

function StockEditor({
  product,
  disabled,
  onSave,
}: {
  product: Product
  disabled: boolean
  onSave: (qty: number, trackStock: boolean) => void
}) {
  const [value, setValue] = useState(String(product.stockQty))

  useEffect(() => {
    setValue(String(product.stockQty))
  }, [product.stockQty])

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSave(product.stockQty, !product.trackStock)}
        className={`text-xs px-2 py-1 rounded-md disabled:opacity-50 ${
          product.trackStock
            ? 'bg-blue-50 text-blue-700 hover:bg-blue-100'
            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
        }`}
        aria-label={t.trackStock}
        title={t.trackStock}
      >
        {product.trackStock ? t.trackStockOn : t.trackStockOff}
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        value={value}
        disabled={disabled || !product.trackStock}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => onSave(Math.max(0, Math.round(Number(value) || 0)), product.trackStock)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        className="w-16 rounded-lg border border-gray-300 px-2 py-1 text-sm text-center focus:border-primary focus:outline-none disabled:opacity-50 disabled:bg-gray-50"
        aria-label={t.stock}
        title={t.stock}
      />
    </div>
  )
}

function ImageEditor({
  product,
  disabled,
  onUpload,
  onRemove,
}: {
  product: Product
  disabled: boolean
  onUpload: (file: File) => void
  onRemove: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex flex-col items-center gap-1 shrink-0">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onUpload(file)
          e.target.value = ''
        }}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="relative h-16 w-16 rounded-lg border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center text-gray-400 hover:border-primary disabled:opacity-50"
        title={product.imagePath ? t.imageChange : t.imageUpload}
        aria-label={product.imagePath ? t.imageChange : t.imageUpload}
      >
        {product.imagePath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imagePath}
            alt={product.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-2xl leading-none">+</span>
        )}
      </button>
      {product.imagePath && (
        <button
          type="button"
          disabled={disabled}
          onClick={onRemove}
          className="text-[11px] text-gray-400 hover:text-red-600 disabled:opacity-50"
        >
          {t.imageRemove}
        </button>
      )}
    </div>
  )
}

function NewProductForm({
  categories,
  onCancel,
  onCreated,
  onError,
}: {
  categories: Category[]
  onCancel: () => void
  onCreated: () => void
  onError: (msg: string) => void
}) {
  const [name, setName] = useState('')
  const [barcode, setBarcode] = useState('')
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '')
  const [price, setPrice] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const valid = name.trim() && barcode.trim() && categoryId && Number(price) >= 0 && price !== ''
  const imagePreview = imageFile ? URL.createObjectURL(imageFile) : null

  async function submit() {
    if (!valid || saving) return
    setSaving(true)
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          barcode: barcode.trim(),
          categoryId,
          priceAgorot: Math.round(Number(price) * 100),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        onError(data?.error?.message ?? i18n.errors.serverError)
        return
      }
      // If an image was chosen, upload it to the freshly created product.
      const newId = data?.product?.id as string | undefined
      if (newId && imageFile) {
        const body = new FormData()
        body.append('file', imageFile)
        const imgRes = await fetch(`/api/products/${newId}/image`, {
          method: 'POST',
          body,
        })
        if (!imgRes.ok) {
          const imgData = await imgRes.json().catch(() => null)
          onError(imgData?.error?.message ?? i18n.errors.serverError)
        }
      }
      onCreated()
    } catch {
      onError(i18n.errors.network)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mb-4 bg-white rounded-xl border border-gray-200 p-4">
      <h3 className="font-semibold text-gray-800 mb-3">{t.addProduct}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs text-gray-500">{t.name}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">{t.barcode}</span>
          <input
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-left focus:border-primary focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">{t.category}</span>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">{t.price}</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={0.01}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-left focus:border-primary focus:outline-none"
          />
        </label>
      </div>
      <div className="mt-3">
        <span className="text-xs text-gray-500">{t.image}</span>
        <div className="mt-1 flex items-center gap-3">
          <input
            ref={imageInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            className="h-20 w-20 rounded-lg border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center text-gray-400 hover:border-primary"
            title={t.imageUpload}
            aria-label={t.imageUpload}
          >
            {imagePreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imagePreview} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-2xl leading-none">+</span>
            )}
          </button>
          {imageFile && (
            <button
              type="button"
              onClick={() => setImageFile(null)}
              className="text-xs text-gray-400 hover:text-red-600"
            >
              {t.imageRemove}
            </button>
          )}
        </div>
      </div>
      <div className="flex gap-2 mt-4">
        <button
          onClick={submit}
          disabled={!valid || saving}
          className="bg-primary text-white rounded-lg px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
        >
          {saving ? t.saving : t.save}
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
        >
          {t.cancel}
        </button>
      </div>
    </div>
  )
}
