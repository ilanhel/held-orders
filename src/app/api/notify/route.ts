import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { NotificationService } from '@/services/notifications'
import { requireSession } from '@/lib/session'
import { i18n } from '@/lib/i18n'

const schema = z.object({
  phone: z.string().min(9).max(60),
  body: z.string().min(1).max(1000),
})

const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10MB

/**
 * POST /api/notify — send a one-off WhatsApp message to a single phone.
 * ADMIN only. Two content types:
 *   - application/json: { phone, body } — plain text message
 *   - multipart/form-data: fields phone, body (caption) + file — file message
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

  try {
    const contentType = req.headers.get('content-type') ?? ''

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData()
      const phone = String(form.get('phone') ?? '').trim()
      const body = String(form.get('body') ?? '').trim()
      const file = form.get('file')
      if (!phone || phone.length < 9 || !(file instanceof File) || file.size === 0) {
        return NextResponse.json(
          { error: { code: 'VALIDATION', message: i18n.errors.serverError } },
          { status: 400 }
        )
      }
      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json(
          { error: { code: 'TOO_LARGE', message: i18n.errors.serverError } },
          { status: 400 }
        )
      }
      const buffer = Buffer.from(await file.arrayBuffer())
      await NotificationService.sendWithFile(
        { type: 'DIRECT_MESSAGE', body: body || file.name },
        { phone },
        { filename: file.name, buffer, caption: body || undefined }
      )
      return NextResponse.json({ sent: true })
    }

    const parsed = schema.parse(await req.json())
    await NotificationService.send(
      { type: 'DIRECT_MESSAGE', body: parsed.body },
      { phone: parsed.phone }
    )
    return NextResponse.json({ sent: true })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: i18n.errors.serverError } },
        { status: 400 }
      )
    }
    console.error('[api/notify] error:', err)
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: i18n.errors.serverError } },
      { status: 500 }
    )
  }
}
