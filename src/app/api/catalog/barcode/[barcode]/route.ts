import { NextRequest, NextResponse } from 'next/server'
import { CatalogService } from '@/services/catalog.service'
import { requireSession } from '@/lib/session'
import { i18n } from '@/lib/i18n'

/**
 * GET /api/catalog/barcode/[barcode]
 * Exact barcode lookup (e.g. scanner). Returns null/404 for HIDDEN or unknown.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ barcode: string }> }
) {
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

  const { barcode } = await ctx.params
  try {
    const product = await CatalogService.getByBarcode(barcode)
    if (!product) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: i18n.errors.notFound } },
        { status: 404 }
      )
    }
    return NextResponse.json({ product })
  } catch (err) {
    console.error('[api/catalog/barcode] error:', err)
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: i18n.errors.serverError } },
      { status: 500 }
    )
  }
}
