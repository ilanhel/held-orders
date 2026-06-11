'use client'

import { useEffect, useRef, useState } from 'react'
import { i18n } from '@/lib/i18n'

const MAX_QTY = 9999

/**
 * Quantity stepper with −/+ buttons AND a directly editable number field,
 * so the franchisee can either tap to adjust or type an exact quantity.
 * Typed values are committed on blur / Enter. Always visible (including
 * qty=0); the "−" button is disabled while the quantity is 0.
 */
export function QtyStepper({
  qty,
  onChange,
  saving,
  disabled,
  size = 'md',
}: {
  qty: number
  onChange: (qty: number) => void
  saving: boolean
  disabled?: boolean
  size?: 'md' | 'sm'
}) {
  const [text, setText] = useState(String(qty))
  const editing = useRef(false)
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep the field in sync with the saved qty when not actively editing.
  useEffect(() => {
    if (!editing.current) setText(String(qty))
  }, [qty])

  // Clear any pending debounced commit when the component unmounts.
  useEffect(() => {
    return () => {
      if (commitTimer.current) clearTimeout(commitTimer.current)
    }
  }, [])

  // Commit a raw string value to the parent (no field reset — used while typing).
  function commitValue(raw: string) {
    const n = parseInt(raw, 10)
    if (Number.isNaN(n)) return
    const clamped = Math.max(0, Math.min(MAX_QTY, n))
    if (clamped !== qty) onChange(clamped)
  }

  // Auto-save shortly after the user stops typing, so a typed quantity
  // updates the cart even without an explicit blur / Enter (mobile numeric
  // keyboards have no return key).
  function scheduleCommit(raw: string) {
    if (commitTimer.current) clearTimeout(commitTimer.current)
    commitTimer.current = setTimeout(() => commitValue(raw), 500)
  }

  function commit() {
    editing.current = false
    if (commitTimer.current) clearTimeout(commitTimer.current)
    const n = parseInt(text, 10)
    if (Number.isNaN(n)) {
      setText(String(qty))
      return
    }
    const clamped = Math.max(0, Math.min(MAX_QTY, n))
    if (clamped !== qty) onChange(clamped)
    else setText(String(qty))
  }

  const btn =
    size === 'sm'
      ? 'w-9 h-9 text-lg'
      : 'w-10 h-10 text-xl'

  return (
    <div className="flex items-center justify-between bg-gray-50 rounded-lg p-1 gap-1">
      <button
        type="button"
        onClick={() => onChange(qty - 1)}
        disabled={saving || disabled || qty <= 0}
        className={`${btn} rounded-md bg-white text-gray-700 font-bold active:bg-gray-200 disabled:opacity-50 flex-shrink-0`}
        aria-label={i18n.catalog.decreaseQty}
      >
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        dir="ltr"
        value={text}
        disabled={disabled}
        onFocus={(e) => {
          editing.current = true
          e.currentTarget.select()
        }}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, '').slice(0, 4)
          setText(v)
          scheduleCommit(v)
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
        className="w-12 bg-transparent text-center text-lg font-semibold text-gray-800 focus:outline-none focus:bg-white focus:rounded-md disabled:opacity-50"
        aria-label={i18n.catalog.quantity}
      />
      <button
        type="button"
        onClick={() => onChange(qty + 1)}
        disabled={saving || disabled}
        className={`${btn} rounded-md bg-primary text-white font-bold active:bg-red-700 disabled:opacity-50 flex-shrink-0`}
        aria-label={i18n.catalog.increaseQty}
      >
        +
      </button>
    </div>
  )
}
