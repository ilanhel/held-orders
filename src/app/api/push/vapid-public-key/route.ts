import { NextResponse } from 'next/server'
import { PushService } from '@/services/notifications/push'

/**
 * GET /api/push/vapid-public-key — the public VAPID key the client needs to
 * subscribe. Returns 503 when push is not configured in this environment.
 */
export async function GET() {
  const key = PushService.publicKey()
  if (!key) {
    return NextResponse.json(
      { error: { code: 'PUSH_NOT_CONFIGURED' } },
      { status: 503 }
    )
  }
  return NextResponse.json({ publicKey: key })
}
