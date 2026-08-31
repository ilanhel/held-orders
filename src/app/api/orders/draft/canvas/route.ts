import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { CatalogService } from '@/services/catalog.service'
import { OrderService } from '@/services/order.service'
import { requireSession } from '@/lib/session'
import { i18n } from '@/lib/i18n'
import { hidePricesFor } from '@/lib/hide-prices'

const bodySchema = z.object({
  width: z.number().int().min(10).max(300),
  height: z.number().int().min(10).max(300),
  qty: z.number().int().min(1).max(9999),
})

const errorStatus: Record<string, number> = {
  INVALID_SIZE: 400,
  CANVAS_CATEGORY_NOT_FOUND: 500,
  ORDER_NOT_FOUND: 404,
  ORDER_NOT_DRAFT: 409,
  PRODUCT_HIDDEN: 409,
}

/**
 * POST /api/orders/draft/canvas
 * Add a custom-size canvas frame to the current draft: finds or creates the
 * product for the requested size (10-300cm) and ADDS qty to any existing line.
 * Returns the updated order.
 */
export async function POST(req: NextRequest) {
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
      { error: { code: 'VALIDATION', message: i18n.catalog.customCanvas.invalid } },
      { status: 400 }
    )
  }

  try {
    const draft = await OrderService.getOrCreateDraft(session.storeId, session.userId)
    const product = await CatalogService.ensureCanvasSize(parsed.width, parsed.height)
    const current = draft.items.find((i) => i.productId === product.id)?.qtyOrdered ?? 0
    const updated = await OrderService.setItemQty(draft.id, product.id, current + parsed.qty)
    return NextResponse.json(hidePricesFor(session.role, { order: updated }))
  } catch (err) {
    const code = err instanceof Error ? err.message : 'SERVER_ERROR'
    const status = errorStatus[code] ?? 500
    if (status >= 500) console.error('[api/orders/draft/canvas] error:', err)
    const message =
      code === 'INVALID_SIZE' ? i18n.catalog.customCanvas.invalid : i18n.errors.serverError
    return NextResponse.json({ error: { code, message } }, { status })
  }
}
