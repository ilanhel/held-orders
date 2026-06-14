import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { AnnouncementService } from '@/services/announcement.service'
import { requireSession } from '@/lib/session'
import { i18n } from '@/lib/i18n'

const createSchema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(2000),
  requiresAck: z.boolean().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
})

/**
 * GET /api/announcements
 * List active announcements for the current user.
 * With ?admin=1 (WAREHOUSE/ADMIN): list all announcements with ack counts.
 */
export async function GET(req: NextRequest) {
  const isAdminView = req.nextUrl.searchParams.get('admin') === '1'
  const roles = isAdminView ? ['WAREHOUSE', 'ADMIN'] : undefined
  const { authenticated, session, error } = await requireSession(req, roles)
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
  try {
    if (isAdminView) {
      const announcements = await AnnouncementService.listForAdmin()
      return NextResponse.json({ announcements })
    }
    const announcements = await AnnouncementService.listForUser(session!.userId)
    return NextResponse.json({ announcements })
  } catch (err) {
    console.error('[api/announcements GET] error:', err)
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: i18n.errors.serverError } },
      { status: 500 }
    )
  }
}

/**
 * POST /api/announcements
 * Create + broadcast a new announcement. WAREHOUSE/ADMIN only.
 */
export async function POST(req: NextRequest) {
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

  let parsed
  try {
    parsed = createSchema.parse(await req.json())
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: i18n.errors.serverError } },
      { status: 400 }
    )
  }

  try {
    const ann = await AnnouncementService.create({
      title: parsed.title,
      body: parsed.body,
      requiresAck: parsed.requiresAck,
      expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : null,
    })
    return NextResponse.json({ announcement: ann }, { status: 201 })
  } catch (err) {
    console.error('[api/announcements POST] error:', err)
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: i18n.errors.serverError } },
      { status: 500 }
    )
  }
}
