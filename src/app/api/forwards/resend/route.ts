import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { OrderService } from '@/services/order.service'
import { requireSession } from '@/lib/session'
import { i18n } from '@/lib/i18n'

// Sending WhatsApp for a day's worth of orders can take a while.
export const maxDuration = 60

const schema = z.object({
  sinceHours: z.number().int().min(1).max(168).default(48),
})

/**
 * POST /api/forwards/resend — re-send special-forward WhatsApp messages for
 * submitted orders of the last N hours (backfill after destination config
 * changes). ADMIN only.
 */
export async function POST(req: NextRequest) {
  const { authenticated, error } = await requireSession(req, ['ADMIN'])
  if (!authenticated || error) {
    return NextResponse.json(
      {
        error: {
          code: error === 'Forbidden' ? 'FORBIDDEN' : 'UNAUTHORIZED',
          message: error === 'Forbidden' ? i18n.errors.forbidden : i18n.errors.unauthorized,
        },
      },
      { status: error === 'Forbidden' ? 403 : 401 }
    )
  }

  let parsed
  try {
    parsed = schema.parse(await req.json().catch(() => ({})))
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: i18n.errors.serverError } },
      { status: 400 }
    )
  }

  try {
    const result = await OrderService.resendSpecialForwards(parsed.sinceHours)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[api/forwards/resend] error:', err)
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: i18n.errors.serverError } },
      { status: 500 }
    )
  }
}
