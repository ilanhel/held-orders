import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { CatalogService } from '@/services/catalog.service'
import { requireSession } from '@/lib/session'
import { i18n } from '@/lib/i18n'

const updateSchema = z.object({
  active: z.boolean(),
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

/**
 * PUT /api/products/[id]/barcodes/[aliasId] — hide/restore a barcode variant.
 * ADMIN/WAREHOUSE.
 */
export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; aliasId: string }> }
) {
  const { authenticated, error } = await requireSession(req, ['ADMIN', 'WAREHOUSE'])
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

  const { aliasId } = await ctx.params
  try {
    const barcodes = await CatalogService.setBarcodeActive(aliasId, parsed.active)
    return NextResponse.json({ barcodes })
  } catch (err) {
    const code = err instanceof Error ? err.message : 'SERVER_ERROR'
    if (code === 'BARCODE_NOT_FOUND') {
      return NextResponse.json(
        { error: { code, message: i18n.errors.notFound } },
        { status: 404 }
      )
    }
    if (code === 'LAST_ACTIVE_BARCODE') {
      return NextResponse.json(
        { error: { code, message: i18n.admin.catalog.barcodes.lastActive } },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: i18n.errors.serverError } },
      { status: 500 }
    )
  }
}
