import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { PrismaClient } from '@prisma/client'
import { requireSession } from '@/lib/session'
import { i18n } from '@/lib/i18n'

const prisma = new PrismaClient()

const unsubscribeSchema = z.object({
  endpoint: z.string().url().max(2000),
})

/**
 * POST /api/push/unsubscribe — remove a browser push subscription. Only the
 * owning user may remove their own subscription.
 */
export async function POST(req: NextRequest) {
  const { authenticated, session } = await requireSession(req)
  if (!authenticated || !session) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: i18n.errors.unauthorized } },
      { status: 401 }
    )
  }

  let body
  try {
    body = unsubscribeSchema.parse(await req.json())
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: i18n.errors.serverError } },
      { status: 400 }
    )
  }

  try {
    await prisma.pushSubscription.deleteMany({
      where: { endpoint: body.endpoint, userId: session.userId },
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[api/push/unsubscribe] error:', err)
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: i18n.errors.serverError } },
      { status: 500 }
    )
  }
}
