'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { i18n } from '@/lib/i18n'

type Category = {
  id: string
  name: string
  sortOrder: number
  productCount: number
}

const t = i18n.admin.categories

export default function AdminCategoriesPage() {
  const router = useRouter()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/categories')
      if (res.status === 401) {
        router.push('/login')
        return
      }
      const data = await res.json()
      if (!res.ok) setError(data?.error?.message ?? i18n.errors.serverError)
      else {
        setCategories(data.categories ?? [])
        setError(null)
      }
    } catch {
      setError(i18n.errors.network)
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    void load()
  }, [load])

  function flash(msg: string) {
    setMessage(msg)
    setTimeout(() => setMessage(null), 2500)
  }

  async function deleteCategory(c: Category) {
    if (!window.confirm(t.confirmDelete)) return
    setBusyId(c.id)
    setError(null)
    try {
      const res = await fetch(`/api/categories/${c.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) setError(data?.error?.message ?? i18n.errors.serverError)
      else {
        setCategories((prev) => prev.filter((x) => x.id !== c.id))
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

      <section className="px-4 py-5 max-w-3xl mx-auto">
        {error && (
          <div className="mb-3 rounded-lg bg-red-50 text-red-700 px-3 py-2 text-sm">
            {error}
          </div>
        )}
        {message && (
          <div className="mb-3 rounded-lg bg-green-50 text-green-700 px-3 py-2 text-sm">
            {message}
          </div>
        )}

        <div className="flex justify-between items-center mb-4">
          <p className="text-sm text-gray-500">
            {categories.length} {t.title}
          </p>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="bg-primary text-white rounded-lg px-4 py-2 text-sm font-semibold hover:opacity-90"
          >
            {t.newCategory}
          </button>
        </div>

        {showForm && (
          <NewCategoryForm
            onCancel={() => setShowForm(false)}
            onCreated={() => {
              setShowForm(false)
              flash(t.created)
              void load()
            }}
            onError={setError}
          />
        )}

        {loading ? (
          <p className="text-gray-500 py-8 text-center">{i18n.common.loading}</p>
        ) : categories.length === 0 ? (
          <p className="text-gray-500 py-12 text-center">{t.noCategories}</p>
        ) : (
          <ul className="space-y-2">
            {categories.map((c) =>
              editingId === c.id ? (
                <li key={c.id}>
                  <EditCategoryForm
                    category={c}
                    onCancel={() => setEditingId(null)}
                    onSaved={(updated) => {
                      setCategories((prev) =>
                        prev
                          .map((x) => (x.id === updated.id ? { ...x, ...updated } : x))
                          .sort((a, b) => a.sortOrder - b.sortOrder)
                      )
                      setEditingId(null)
                      flash(t.updated)
                    }}
                    onError={setError}
                  />
                </li>
              ) : (
                <li
                  key={c.id}
                  className="bg-white rounded-xl border border-gray-200 p-3 flex items-center gap-3"
                >
                  <span className="text-xs text-gray-400 w-8 text-center shrink-0">
                    {c.sortOrder}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-gray-900">{c.name}</span>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {c.productCount} {t.products}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setError(null)
                      setEditingId(c.id)
                    }}
                    className="text-xs px-3 py-1.5 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100"
                  >
                    {t.edit}
                  </button>
                  <button
                    onClick={() => deleteCategory(c)}
                    disabled={busyId === c.id}
                    className="text-xs px-3 py-1.5 rounded-md bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
                  >
                    {busyId === c.id ? t.deleting : t.delete}
                  </button>
                </li>
              )
            )}
          </ul>
        )}
      </section>
    </main>
  )
}

function NewCategoryForm({
  onCancel,
  onCreated,
  onError,
}: {
  onCancel: () => void
  onCreated: () => void
  onError: (msg: string) => void
}) {
  const [name, setName] = useState('')
  const [sortOrder, setSortOrder] = useState('')
  const [saving, setSaving] = useState(false)

  const valid = name.trim()

  async function submit() {
    if (!valid || saving) return
    setSaving(true)
    try {
      const body: { name: string; sortOrder?: number } = { name: name.trim() }
      const n = Number(sortOrder)
      if (sortOrder.trim() !== '' && Number.isInteger(n)) body.sortOrder = n
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) onError(data?.error?.message ?? i18n.errors.serverError)
      else onCreated()
    } catch {
      onError(i18n.errors.network)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mb-4 bg-white rounded-xl border border-gray-200 p-4">
      <h3 className="font-semibold text-gray-800 mb-3">{t.addCategory}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="block sm:col-span-2">
          <span className="text-xs text-gray-500">{t.name}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">{t.sortOrder}</span>
          <input
            value={sortOrder}
            inputMode="numeric"
            onChange={(e) => setSortOrder(e.target.value)}
            placeholder={t.sortOrderHint}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-left focus:border-primary focus:outline-none"
          />
        </label>
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

function EditCategoryForm({
  category,
  onCancel,
  onSaved,
  onError,
}: {
  category: Category
  onCancel: () => void
  onSaved: (updated: { id: string; name: string; sortOrder: number }) => void
  onError: (msg: string) => void
}) {
  const [name, setName] = useState(category.name)
  const [sortOrder, setSortOrder] = useState(String(category.sortOrder))
  const [saving, setSaving] = useState(false)

  const valid = name.trim()

  async function submit() {
    if (!valid || saving) return
    setSaving(true)
    try {
      const body: { name: string; sortOrder?: number } = { name: name.trim() }
      const n = Number(sortOrder)
      if (sortOrder.trim() !== '' && Number.isInteger(n)) body.sortOrder = n
      const res = await fetch(`/api/categories/${category.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) onError(data?.error?.message ?? i18n.errors.serverError)
      else
        onSaved({
          id: category.id,
          name: name.trim(),
          sortOrder: body.sortOrder ?? category.sortOrder,
        })
    } catch {
      onError(i18n.errors.network)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-blue-200 ring-1 ring-blue-100 p-4">
      <h3 className="font-semibold text-gray-800 mb-3">{t.editCategory}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="block sm:col-span-2">
          <span className="text-xs text-gray-500">{t.name}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">{t.sortOrder}</span>
          <input
            value={sortOrder}
            inputMode="numeric"
            onChange={(e) => setSortOrder(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-left focus:border-primary focus:outline-none"
          />
        </label>
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
