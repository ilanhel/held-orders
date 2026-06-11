import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { OrderService } from '@/services/order.service'
import { requireSession } from '@/lib/session'
import { i18n } from '@/lib/i18n'

const bodySchema = z.object({
  qtySupplied: z.number().int().min(0).max(9999),
  picked: z.boolean(),
})

const errorStatus: Record<string, number> = {
  ORDER_NOT_FOUND: 404,
  ITEM_NOT_FOUND: 404,
  ORDER_NOT_PICKABLE: 409,
  INVALID_QTY: 400,
}

/**
 * PUT /api/orders/[id]/items/[itemId]
 * Warehouse-only: update qtySupplied and picked flag during picking.
 */
export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; itemId: string }> }
) {
  const { authenticated, error } = await requireSession(req, ['WAREHOUSE', 'ADMIN'])
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

  let parsed
  try {
    parsed = bodySchema.parse(await req.json())
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: i18n.errors.serverError } },
      { status: 400 }
    )
  }

  const { id, itemId } = await ctx.params
  try {
    const updated = await OrderService.updateItemSupply(id, itemId, parsed.qtySupplied, parsed.picked)
    return NextResponse.json({ order: updated })
  } catch (err) {
    const code = err instanceof Error ? err.message : 'SERVER_ERROR'
    const status = errorStatus[code] ?? 500
    if (status === 500) console.error('[api/orders/:id/items/:itemId] error:', err)
    return NextResponse.json(
      { error: { code, message: i18n.errors.serverError } },
      { status }
    )
  }
}
