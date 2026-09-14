import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { OrderService } from '@/services/order.service'
import { requireSession } from '@/lib/session'
import { i18n } from '@/lib/i18n'
import { hidePricesFor } from '@/lib/hide-prices'

const schema = z.object({
  note: z.string().max(500).nullable(),
})

const errorStatus: Record<string, number> = {
  ORDER_NOT_FOUND: 404,
  ORDER_NOT_DRAFT: 409,
  NOTE_TOO_LONG: 400,
}

/**
 * PUT /api/orders/draft/note — set/clear the franchisee's note to the
 * warehouse on the current draft.
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
    parsed = schema.parse(await req.json())
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: i18n.errors.serverError } },
      { status: 400 }
    )
  }

  try {
    const draft = await OrderService.getOrCreateDraft(session.storeId, session.userId)
    const order = await OrderService.setDraftNote(draft.id, parsed.note)
    return NextResponse.json(hidePricesFor(session?.role, { order }))
  } catch (err) {
    const code = err instanceof Error ? err.message : 'SERVER_ERROR'
    const status = errorStatus[code] ?? 500
    if (status === 500) console.error('[api/orders/draft/note] error:', err)
    return NextResponse.json(
      { error: { code, message: i18n.errors.serverError } },
      { status }
    )
  }
}
