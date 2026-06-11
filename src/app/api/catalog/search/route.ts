import { NextRequest, NextResponse } from 'next/server'
import { CatalogService } from '@/services/catalog.service'
import { requireSession } from '@/lib/session'
import { i18n } from '@/lib/i18n'

/**
 * GET /api/catalog/search?q=...
 * Live search by name (partial) or exact barcode.
 * Excludes HIDDEN products. Returns up to 50 results.
 */
export async function GET(req: NextRequest) {
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

  const q = req.nextUrl.searchParams.get('q') ?? ''
  try {
    const results = await CatalogService.searchProducts(q)
    return NextResponse.json({ products: results })
  } catch (err) {
    console.error('[api/catalog/search] error:', err)
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: i18n.errors.serverError } },
      { status: 500 }
    )
  }
}
