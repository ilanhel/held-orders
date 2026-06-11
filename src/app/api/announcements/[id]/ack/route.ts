import { NextRequest, NextResponse } from 'next/server'
import { AnnouncementService } from '@/services/announcement.service'
import { requireSession } from '@/lib/session'
import { i18n } from '@/lib/i18n'

/**
 * POST /api/announcements/[id]/ack
 * Record that the current user acknowledged this announcement.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { authenticated, session, error } = await requireSession(req)
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
    await AnnouncementService.ack(id, session!.userId)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[api/announcements/:id/ack] error:', err)
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: i18n.errors.serverError } },
      { status: 500 }
    )
  }
}
