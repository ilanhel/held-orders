import { NextRequest, NextResponse } from 'next/server'
import { OrderService } from '@/services/order.service'
import { requireSession } from '@/lib/session'
import { i18n } from '@/lib/i18n'

const errorStatus: Record<string, number> = {
  ORDER_NOT_FOUND: 404,
  ORDER_NOT_SUBMITTED: 409,
  ERP_PHONE_NOT_CONFIGURED: 409,
}

/**
 * POST /api/orders/[id]/finish-picking
 * Warehouse-only, one tap: notify franchisee(s) about shortages (if any)
 * and send the ERP-intake XLSX to the preconfigured ERP WhatsApp number.
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
    const result = await OrderService.finishPicking(id)
    return NextResponse.json(result)
  } catch (err) {
    const code = err instanceof Error ? err.message : 'SERVER_ERROR'
    const status = errorStatus[code] ?? 500
    if (status === 500) console.error('[api/orders/:id/finish-picking] error:', err)
    const message =
      code === 'ERP_PHONE_NOT_CONFIGURED'
        ? i18n.warehouse.pick.erpNotConfigured
        : i18n.errors.serverError
    return NextResponse.json({ error: { code, message } }, { status })
  }
}
