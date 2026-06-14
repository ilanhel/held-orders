import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ProductRecognitionService } from '@/services/recognition'
import { requireSession } from '@/lib/session'
import { i18n } from '@/lib/i18n'

// ~8MB after base64 expansion (base64 is ~4/3 of raw bytes).
const MAX_BASE64_LEN = 8 * 1024 * 1024 * 1.4
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp']

const bodySchema = z.object({
  image: z.string().min(16),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
})

/**
 * POST /api/recognize
 * Body: { image: base64 (no data: prefix), mimeType }
 * Returns up to 3 catalog matches: { matches: [{ product, confidence }] }.
 * Available to any authenticated user (franchisees use it from the scan screen).
 */
export async function POST(req: NextRequest) {
  const { authenticated, error } = await requireSession(req)
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
    const raw = await req.json()
    parsed = bodySchema.parse(raw)
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: i18n.errors.imageInvalid } },
      { status: 400 }
    )
  }

  if (!ALLOWED_MIME.includes(parsed.mimeType)) {
    return NextResponse.json(
      { error: { code: 'IMAGE_INVALID', message: i18n.errors.imageInvalid } },
      { status: 400 }
    )
  }
  if (parsed.image.length > MAX_BASE64_LEN) {
    return NextResponse.json(
      { error: { code: 'IMAGE_TOO_LARGE', message: i18n.errors.imageTooLarge } },
      { status: 413 }
    )
  }

  try {
    const matches = await ProductRecognitionService.recognize({
      base64: parsed.image,
      mimeType: parsed.mimeType,
    })
    return NextResponse.json({ matches })
  } catch (err) {
    const code = err instanceof Error ? err.message : 'SERVER_ERROR'
    if (code === 'RECOGNITION_NOT_CONFIGURED') {
      return NextResponse.json(
        { error: { code, message: i18n.errors.recognitionUnavailable } },
        { status: 503 }
      )
    }
    console.error('[api/recognize] error:', err)
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: i18n.errors.serverError } },
      { status: 500 }
    )
  }
}
