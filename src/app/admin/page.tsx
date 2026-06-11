'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { i18n } from '@/lib/i18n'

export default function AdminHomePage() {
  const router = useRouter()
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    // Verify session by hitting an ADMIN-only endpoint; redirect to login on 401.
    fetch('/api/products?status=ACTIVE')
      .then((res) => {
        if (res.status === 401) {
          router.push('/login')
          return
        }
        setChecked(true)
      })
      .catch(() => setChecked(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const tiles = [
    { label: i18n.admin.catalogMgmt, icon: '📦', href: '/admin/catalog' },
    { label: i18n.admin.ordersMgmt, icon: '📋', href: '/warehouse' },
    { label: i18n.admin.announcementsMgmt, icon: '📢', href: '/warehouse/announcements' },
  ]

  if (!checked) {
    return (
      <main className="min-h-screen grid place-items-center bg-gray-50">
        <p className="text-gray-500">{i18n.common.loading}</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <h1 className="text-xl font-bold text-primary flex-1">{i18n.admin.home}</h1>
        <button onClick={logout} className="text-sm text-gray-500">
          {i18n.auth.logout}
        </button>
      </header>

      <section className="px-4 py-6 max-w-2xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {tiles.map((t) => (
            <button
              key={t.href}
              onClick={() => router.push(t.href)}
              className="bg-white rounded-2xl border border-gray-200 p-6 text-center hover:border-primary transition flex flex-col items-center gap-2"
            >
              <span className="text-4xl">{t.icon}</span>
              <span className="font-semibold text-gray-800">{t.label}</span>
            </button>
          ))}
        </div>
      </section>
    </main>
  )
}
