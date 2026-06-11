import { NextRequest, NextResponse } from 'next/server'
import { OrderService } from '@/services/order.service'
import { requireSession } from '@/lib/session'
import { i18n } from '@/lib/i18n'

const errorStatus: Record<string, number> = {
  ORDER_NOT_FOUND: 404,
  ORDER_NOT_SUBMITTED: 409,
}

/**
 * POST /api/orders/[id]/notify-shortages
 * Warehouse-only: send shortage notification to the franchisee(s).
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
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

  const { id } = await ctx.params
  try {
    const result = await OrderService.notifyShortages(id)
    return NextResponse.json(result)
  } catch (err) {
    const code = err instanceof Error ? err.message : 'SERVER_ERROR'
    const status = errorStatus[code] ?? 500
    if (status === 500) console.error('[api/orders/:id/notify-shortages] error:', err)
    return NextResponse.json(
      { error: { code, message: i18n.errors.serverError } },
      { status }
    )
  }
}
