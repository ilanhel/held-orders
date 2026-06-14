'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { i18n } from '@/lib/i18n'

type Role = 'FRANCHISEE' | 'WAREHOUSE' | 'ADMIN'

type User = {
  id: string
  name: string
  phone: string
  role: Role
  storeId: string | null
  storeName: string | null
  active: boolean
}

type StoreOption = { id: string; name: string; code: string; active: boolean }

const t = i18n.admin.users

const ROLE_COLOR: Record<Role, string> = {
  FRANCHISEE: 'bg-blue-100 text-blue-800',
  WAREHOUSE: 'bg-amber-100 text-amber-800',
  ADMIN: 'bg-purple-100 text-purple-800',
}

export default function AdminUsersPage() {
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [stores, setStores] = useState<StoreOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [uRes, sRes] = await Promise.all([
        fetch('/api/users'),
        fetch('/api/stores'),
      ])
      if (uRes.status === 401 || sRes.status === 401) {
        router.push('/login')
        return
      }
      const uData = await uRes.json()
      const sData = await sRes.json()
      if (!uRes.ok) setError(uData?.error?.message ?? i18n.errors.serverError)
      else {
        setUsers(uData.users ?? [])
        setStores(sData.stores ?? [])
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

  async function toggleActive(u: User) {
    setBusyId(u.id)
    setError(null)
    try {
      const res = await fetch(`/api/users/${u.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !u.active }),
      })
      const data = await res.json()
      if (!res.ok) setError(data?.error?.message ?? i18n.errors.serverError)
      else {
        setUsers((prev) =>
          prev.map((x) => (x.id === u.id ? { ...x, active: !u.active } : x))
        )
        flash(t.updated)
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

        <p className="text-xs text-gray-400 mb-3">{t.loginHint}</p>

        <div className="flex justify-between items-center mb-4">
          <p className="text-sm text-gray-500">
            {users.length} {t.title}
          </p>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="bg-primary text-white rounded-lg px-4 py-2 text-sm font-semibold hover:opacity-90"
          >
            {t.newUser}
          </button>
        </div>

        {showForm && (
          <NewUserForm
            stores={stores}
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
        ) : users.length === 0 ? (
          <p className="text-gray-500 py-12 text-center">{t.noUsers}</p>
        ) : (
          <ul className="space-y-2">
            {users.map((u) => (
              <li
                key={u.id}
                className="bg-white rounded-xl border border-gray-200 p-3 flex items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900">{u.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${ROLE_COLOR[u.role]}`}>
                      {t.roles[u.role]}
                    </span>
                    {!u.active && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-500">
                        {t.inactive}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {u.phone}
                    {u.storeName ? ` · ${u.storeName}` : ''}
                  </div>
                </div>
                <button
                  onClick={() => toggleActive(u)}
                  disabled={busyId === u.id}
                  className={`text-xs px-3 py-1.5 rounded-md disabled:opacity-50 ${
                    u.active
                      ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      : 'bg-green-50 text-green-700 hover:bg-green-100'
                  }`}
                >
                  {u.active ? t.deactivate : t.activate}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

function NewUserForm({
  stores,
  onCancel,
  onCreated,
  onError,
}: {
  stores: StoreOption[]
  onCancel: () => void
  onCreated: () => void
  onError: (msg: string) => void
}) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<Role>('FRANCHISEE')
  const [storeId, setStoreId] = useState('')
  const [saving, setSaving] = useState(false)

  const activeStores = stores.filter((s) => s.active)
  const needsStore = role === 'FRANCHISEE'
  const valid = name.trim() && phone.trim() && (!needsStore || storeId)

  async function submit() {
    if (!valid || saving) return
    setSaving(true)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          role,
          storeId: needsStore ? storeId : null,
        }),
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
      <h3 className="font-semibold text-gray-800 mb-3">{t.addUser}</h3>
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
          <span className="text-xs text-gray-500">{t.phone}</span>
          <input
            value={phone}
            inputMode="tel"
            onChange={(e) => setPhone(e.target.value)}
            placeholder="050-0000000"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-left focus:border-primary focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">{t.role}</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
          >
            <option value="FRANCHISEE">{t.roles.FRANCHISEE}</option>
            <option value="WAREHOUSE">{t.roles.WAREHOUSE}</option>
            <option value="ADMIN">{t.roles.ADMIN}</option>
          </select>
        </label>
        {needsStore && (
          <label className="block">
            <span className="text-xs text-gray-500">{t.store}</span>
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
            >
              <option value="">{t.noStore}</option>
              {activeStores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </label>
        )}
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
