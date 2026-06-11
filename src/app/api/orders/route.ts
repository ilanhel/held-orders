import { NextRequest, NextResponse } from 'next/server'
import { OrderService } from '@/services/order.service'
import { requireSession } from '@/lib/session'
import { i18n } from '@/lib/i18n'

/**
 * GET /api/orders
 * Returns the franchisee's order history (submitted onwards; no DRAFT).
 */
export async function GET(req: NextRequest) {
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

  try {
    const orders = await OrderService.getStoreOrders(session.storeId)
    return NextResponse.json({ orders })
  } catch (err) {
    console.error('[api/orders] error:', err)
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: i18n.errors.serverError } },
      { status: 500 }
    )
  }
}
