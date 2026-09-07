import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { CatalogService } from '@/services/catalog.service'
import { requireSession } from '@/lib/session'
import { i18n } from '@/lib/i18n'

const mutateSchema = z.object({
  colorName: z.string().min(1).max(40),
  groups: z.array(z.string().min(1).max(120)).min(1).max(100),
  remove: z.boolean().optional(),
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

/** GET /api/frame-colors — variant color groups (frames, inks…). ADMIN only. */
export async function GET(req: NextRequest) {
  const { authenticated, error } = await requireSession(req, ['ADMIN'])
  if (!authenticated || error) return authError(error)

  try {
    const groups = await CatalogService.listVariantGroups()
    return NextResponse.json({ groups })
  } catch (err) {
    console.error('[api/frame-colors GET] error:', err)
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: i18n.errors.serverError } },
      { status: 500 }
    )
  }
}

/**
 * POST /api/frame-colors — add a color to (or with remove:true hide it from)
 * the selected variant groups. ADMIN only.
 */
export async function POST(req: NextRequest) {
  const { authenticated, error } = await requireSession(req, ['ADMIN'])
  if (!authenticated || error) return authError(error)

  let parsed
  try {
    parsed = mutateSchema.parse(await req.json())
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: i18n.errors.serverError } },
      { status: 400 }
    )
  }

  try {
    if (parsed.remove) {
      const result = await CatalogService.removeVariantColor(parsed.colorName, parsed.groups)
      return NextResponse.json(result)
    }
    const result = await CatalogService.addVariantColor(parsed.colorName, parsed.groups)
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    const code = err instanceof Error ? err.message : 'SERVER_ERROR'
    if (code === 'INVALID_COLOR' || code === 'INVALID_GROUPS') {
      return NextResponse.json(
        { error: { code, message: i18n.admin.catalog.frameColorInvalid } },
        { status: 400 }
      )
    }
    if (code === 'VARIANT_GROUP_NOT_FOUND') {
      return NextResponse.json(
        { error: { code, message: i18n.errors.notFound } },
        { status: 404 }
      )
    }
    console.error('[api/frame-colors POST] error:', err)
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: i18n.errors.serverError } },
      { status: 500 }
    )
  }
}
