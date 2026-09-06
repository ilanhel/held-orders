import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { SettingsService } from '@/services/settings.service'
import { requireSession } from '@/lib/session'
import { i18n } from '@/lib/i18n'

const updateSchema = z.object({
  specialFramesPhone: z.string().max(60).nullable(),
})

function authError(error: string | null) {
  if (error === 'Forbidden') {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: i18n.errors.forbidden } },
      { status: 403 }
    )
  }
  return NextResponse.json(
    { error: { code: 'UNAUTHORIZED', message: i18n.errors.unauthorized } },
    { status: 401 }
  )
}

/** GET /api/settings — app settings for the admin UI. ADMIN only. */
export async function GET(req: NextRequest) {
  const { authenticated, error } = await requireSession(req, ['ADMIN'])
  if (!authenticated || error) return authError(error)

  try {
    const specialFramesPhone = await SettingsService.getSpecialFramesPhone()
    return NextResponse.json({ settings: { specialFramesPhone } })
  } catch (err) {
    console.error('[api/settings GET] error:', err)
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: i18n.errors.serverError } },
      { status: 500 }
    )
  }
}

/** PUT /api/settings — update app settings. ADMIN only. */
export async function PUT(req: NextRequest) {
  const { authenticated, error } = await requireSession(req, ['ADMIN'])
  if (!authenticated || error) return authError(error)

  let parsed
  try {
    parsed = updateSchema.parse(await req.json())
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: i18n.errors.serverError } },
      { status: 400 }
    )
  }

  try {
    await SettingsService.setSpecialFramesPhone(parsed.specialFramesPhone)
    const specialFramesPhone = await SettingsService.getSpecialFramesPhone()
    return NextResponse.json({ settings: { specialFramesPhone } })
  } catch (err) {
    const code = err instanceof Error ? err.message : 'SERVER_ERROR'
    if (code === 'INVALID_PHONE') {
      return NextResponse.json(
        { error: { code, message: i18n.admin.settings.invalidPhone } },
        { status: 400 }
      )
    }
    console.error('[api/settings PUT] error:', err)
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: i18n.errors.serverError } },
      { status: 500 }
    )
  }
}
