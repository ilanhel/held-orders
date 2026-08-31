import { NextRequest, NextResponse } from 'next/server'
import { CatalogService } from '@/services/catalog.service'
import { requireSession } from '@/lib/session'
import { i18n } from '@/lib/i18n'
import { hidePricesFor } from '@/lib/hide-prices'

/**
 * GET /api/catalog
 * Returns all categories with their visible products (ACTIVE + OUT_OF_STOCK).
 * HIDDEN products and empty categories are filtered out.
 * Auth: any logged-in user.
 */
export async function GET(req: NextRequest) {
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

  try {
    const catalog = await CatalogService.getCatalog()
    return NextResponse.json(hidePricesFor(session?.role, { categories: catalog }))
  } catch (err) {
    console.error('[api/catalog] error:', err)
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: i18n.errors.serverError } },
      { status: 500 }
    )
  }
}
