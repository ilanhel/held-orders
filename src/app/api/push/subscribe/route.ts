import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { PrismaClient } from '@prisma/client'
import { requireSession } from '@/lib/session'
import { i18n } from '@/lib/i18n'

const prisma = new PrismaClient()

const subscribeSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(500),
  }),
})

/**
 * POST /api/push/subscribe — store (or refresh) a browser push subscription
 * for the authenticated user. Idempotent on endpoint.
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
    body = subscribeSchema.parse(await req.json())
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: i18n.errors.serverError } },
      { status: 400 }
    )
  }

  try {
    await prisma.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      create: {
        userId: session.userId,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
      },
      update: {
        userId: session.userId,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
      },
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[api/push/subscribe] error:', err)
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: i18n.errors.serverError } },
      { status: 500 }
    )
  }
}
