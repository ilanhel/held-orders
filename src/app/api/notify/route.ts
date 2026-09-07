import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { NotificationService } from '@/services/notifications'
import { requireSession } from '@/lib/session'
import { i18n } from '@/lib/i18n'

const schema = z.object({
  phone: z.string().min(9).max(60),
  body: z.string().min(1).max(1000),
})

/**
 * POST /api/notify — send a one-off WhatsApp message to a single phone
 * (e.g. a welcome message to a new franchisee). ADMIN only.
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
    parsed = schema.parse(await req.json())
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: i18n.errors.serverError } },
      { status: 400 }
    )
  }

  try {
    await NotificationService.send(
      { type: 'DIRECT_MESSAGE', body: parsed.body },
      { phone: parsed.phone }
    )
    return NextResponse.json({ sent: true })
  } catch (err) {
    console.error('[api/notify] error:', err)
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: i18n.errors.serverError } },
      { status: 500 }
    )
  }
}
