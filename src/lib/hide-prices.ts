import type { Role } from '@prisma/client'

const PRICE_KEYS = new Set(['priceAgorot', 'totalAgorot'])

function zeroPrices(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(zeroPrices)
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = PRICE_KEYS.has(k) && typeof v === 'number' ? 0 : zeroPrices(v)
    }
    return out
  }
  return value
}

/**
 * Franchisees must never see prices (SPEC: prices are warehouse/admin-only).
 * The UI does not render them, but API payloads still carried the numbers —
 * this zeroes every priceAgorot/totalAgorot field for FRANCHISEE sessions.
 * Fields are zeroed (not removed) so existing clients keep valid numbers.
 */
export function hidePricesFor<T>(role: Role | undefined, payload: T): T {
  if (role !== 'FRANCHISEE') return payload
  return zeroPrices(payload) as T
}
