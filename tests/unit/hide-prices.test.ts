import { describe, it, expect } from 'vitest'
import { hidePricesFor } from '@/lib/hide-prices'

const payload = {
  order: {
    id: 'o1',
    totalAgorot: 12900,
    items: [
      { id: 'i1', productName: 'מסגרת', priceAgorot: 4900, qtyOrdered: 2 },
      { id: 'i2', productName: 'בלוק', priceAgorot: 8000, qtyOrdered: 1 },
    ],
  },
  categories: [{ name: 'מסגרות', products: [{ name: 'מסגרת', priceAgorot: 4900 }] }],
}

describe('hidePricesFor', () => {
  it('zeroes priceAgorot and totalAgorot everywhere for FRANCHISEE', () => {
    const out = hidePricesFor('FRANCHISEE', payload)
    expect(out.order.totalAgorot).toBe(0)
    expect(out.order.items.map((i) => i.priceAgorot)).toEqual([0, 0])
    expect(out.categories[0].products[0].priceAgorot).toBe(0)
  })

  it('keeps all other fields intact', () => {
    const out = hidePricesFor('FRANCHISEE', payload)
    expect(out.order.items[0].productName).toBe('מסגרת')
    expect(out.order.items[0].qtyOrdered).toBe(2)
    expect(out.order.id).toBe('o1')
  })

  it('does not touch payloads for WAREHOUSE and ADMIN', () => {
    expect(hidePricesFor('WAREHOUSE', payload)).toEqual(payload)
    expect(hidePricesFor('ADMIN', payload)).toEqual(payload)
  })

  it('handles arrays and nulls safely', () => {
    const p = { orders: [null, { totalAgorot: 5, sub: null }] }
    expect(hidePricesFor('FRANCHISEE', p)).toEqual({ orders: [null, { totalAgorot: 0, sub: null }] })
  })
})
