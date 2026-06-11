import { NextRequest, NextResponse } from 'next/server'
import { OrderService } from '@/services/order.service'
import { requireSession } from '@/lib/session'
import { i18n } from '@/lib/i18n'

const errorStatus: Record<string, number> = {
  ORDER_NOT_FOUND: 404,
  ORDER_NOT_DRAFT: 409,
  ORDER_EMPTY: 400,
  PRODUCT_NOT_FOUND: 404,
  PRODUCT_HIDDEN: 409,
}

/**
 * POST /api/orders/draft/submit
 * Submit the current draft order: locks prices, assigns number, → SUBMITTED.
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

  try {
    const draft = await OrderService.getOrCreateDraft(session.storeId, session.userId)
    const submitted = await OrderService.submitDraft(draft.id, session.userId)
    return NextResponse.json({ order: submitted })
  } catch (err) {
    const code = err instanceof Error ? err.message : 'SERVER_ERROR'
    const status = errorStatus[code] ?? 500
    if (status === 500) console.error('[api/orders/draft/submit] error:', err)
    return NextResponse.json(
      { error: { code, message: i18n.errors.serverError } },
      { status }
    )
  }
}
