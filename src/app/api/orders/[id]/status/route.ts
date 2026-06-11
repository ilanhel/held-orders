import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { OrderStatus } from '@prisma/client'
import { OrderService } from '@/services/order.service'
import { requireSession } from '@/lib/session'
import { i18n } from '@/lib/i18n'

const bodySchema = z.object({
  status: z.enum([
    OrderStatus.RECEIVED,
    OrderStatus.PICKING,
    OrderStatus.READY,
    OrderStatus.SHIPPED,
    OrderStatus.CANCELLED,
  ]),
})

const errorStatus: Record<string, number> = {
  ORDER_NOT_FOUND: 404,
  INVALID_TRANSITION: 409,
}

/**
 * POST /api/orders/[id]/status
 * Warehouse-driven status transition. Body: { status: 'RECEIVED' | 'PICKING' | ... }
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { authenticated, session, error } = await requireSession(req, ['WAREHOUSE', 'ADMIN'])
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

  const { id } = await ctx.params
  try {
    const updated = await OrderService.transitionStatus(id, parsed.status, session!.userId)
    return NextResponse.json({ order: updated })
  } catch (err) {
    const code = err instanceof Error ? err.message : 'SERVER_ERROR'
    const status = errorStatus[code] ?? 500
    if (status === 500) console.error('[api/orders/:id/status] error:', err)
    return NextResponse.json(
      { error: { code, message: i18n.errors.serverError } },
      { status }
    )
  }
}
