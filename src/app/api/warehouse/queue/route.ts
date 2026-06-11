import { NextRequest, NextResponse } from 'next/server'
import { OrderService } from '@/services/order.service'
import { requireSession } from '@/lib/session'
import { i18n } from '@/lib/i18n'

/**
 * GET /api/warehouse/queue
 * Returns all active (non-terminal, non-draft) orders for the warehouse to pick.
 */
export async function GET(req: NextRequest) {
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

  try {
    const orders = await OrderService.getWarehouseQueue()
    return NextResponse.json({ orders })
  } catch (err) {
    console.error('[api/warehouse/queue] error:', err)
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: i18n.errors.serverError } },
      { status: 500 }
    )
  }
}
