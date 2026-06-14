import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { OrderService } from '@/services/order.service'
import { requireSession } from '@/lib/session'
import { i18n } from '@/lib/i18n'

const bodySchema = z.object({
  sourceOrderId: z.string().min(1).optional(),
})

const errorStatus: Record<string, number> = {
  ORDER_NOT_FOUND: 404,
  FORBIDDEN: 403,
  NO_PREVIOUS_ORDER: 404,
}

/**
 * POST /api/orders/reorder
 * Copy a previous order's items into the franchisee's draft.
 * Body: { sourceOrderId?: string } — omit to reorder the most recent order.
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
    parsed = bodySchema.parse(await req.json().catch(() => ({})))
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: i18n.errors.serverError } },
      { status: 400 }
    )
  }

  try {
    const result = parsed.sourceOrderId
      ? await OrderService.reorder(parsed.sourceOrderId, session.storeId, session.userId)
      : await OrderService.reorderLast(session.storeId, session.userId)
    return NextResponse.json({ draft: result.draft, skipped: result.skipped })
  } catch (err) {
    const code = err instanceof Error ? err.message : 'SERVER_ERROR'
    const status = errorStatus[code] ?? 500
    if (status === 500) console.error('[api/orders/reorder] error:', err)
    return NextResponse.json(
      { error: { code, message: i18n.errors.serverError } },
      { status }
    )
  }
}
