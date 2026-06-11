import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { OrderService } from '@/services/order.service'
import { requireSession } from '@/lib/session'
import { i18n } from '@/lib/i18n'

const bodySchema = z.object({
  productId: z.string().min(1),
  qty: z.number().int().min(0).max(9999),
})

const errorStatus: Record<string, number> = {
  INVALID_QTY: 400,
  ORDER_NOT_FOUND: 404,
  ORDER_NOT_DRAFT: 409,
  PRODUCT_NOT_FOUND: 404,
  PRODUCT_HIDDEN: 409,
}

/**
 * PUT /api/orders/draft/items
 * Set quantity for a product in the current draft. qty=0 removes the item.
 * Auto-saves on every call. Returns the updated order.
 */
export async function PUT(req: NextRequest) {
  const { authenticated, session, error } = await requireSession(req, ['FRANCHISEE'])
  if (!authenticated) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: i18n.errors.unauthorized } },
      { status: 401 }
    )
  }
  if (error === 'Forbidden') {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: i18n.errors.forbidden } },
      { status: 403 }
    )
  }
  if (!session?.storeId) {
    return NextResponse.json(
      { error: { code: 'NO_STORE', message: i18n.errors.invalidStore } },
      { status: 400 }
    )
  }

  let parsed
  try {
    parsed = bodySchema.parse(await req.json())
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: i18n.errors.serverError } },
      { status: 400 }
    )
  }

  try {
    const draft = await OrderService.getOrCreateDraft(session.storeId, session.userId)
    const updated = await OrderService.setItemQty(draft.id, parsed.productId, parsed.qty)
    return NextResponse.json({ order: updated })
  } catch (err) {
    const code = err instanceof Error ? err.message : 'SERVER_ERROR'
    const status = errorStatus[code] ?? 500
    if (status === 500) console.error('[api/orders/draft/items] error:', err)
    return NextResponse.json(
      { error: { code, message: i18n.errors.serverError } },
      { status }
    )
  }
}
