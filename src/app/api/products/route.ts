import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ProductStatus } from '@prisma/client'
import { CatalogService } from '@/services/catalog.service'
import { requireSession } from '@/lib/session'
import { i18n } from '@/lib/i18n'

const createSchema = z.object({
  name: z.string().min(1).max(200),
  barcode: z.string().min(1).max(64),
  categoryId: z.string().min(1),
  priceAgorot: z.number().int().min(0).max(100_000_00),
  status: z.nativeEnum(ProductStatus).optional(),
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
 * GET /api/products — admin product list + categories.
 * Optional query: ?search=&categoryId=&status=
 */
export async function GET(req: NextRequest) {
  const { authenticated, error } = await requireSession(req, ['ADMIN'])
  if (!authenticated || error) return authError(error)

  const { searchParams } = new URL(req.url)
  const statusParam = searchParams.get('status')
  const status =
    statusParam && statusParam in ProductStatus
      ? (statusParam as ProductStatus)
      : undefined

  try {
    const [products, categories] = await Promise.all([
      CatalogService.listForAdmin({
        search: searchParams.get('search') ?? undefined,
        categoryId: searchParams.get('categoryId') ?? undefined,
        status,
      }),
      CatalogService.listCategories(),
    ])
    return NextResponse.json({ products, categories })
  } catch (err) {
    console.error('[api/products GET] error:', err)
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: i18n.errors.serverError } },
      { status: 500 }
    )
  }
}

/**
 * POST /api/products — create a product. ADMIN only.
 * Duplicate barcode → 409.
 */
export async function POST(req: NextRequest) {
  const { authenticated, error } = await requireSession(req, ['ADMIN'])
  if (!authenticated || error) return authError(error)

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
    const product = await CatalogService.createProduct(parsed)
    return NextResponse.json({ product }, { status: 201 })
  } catch (err) {
    const code = err instanceof Error ? err.message : 'SERVER_ERROR'
    if (code === 'BARCODE_EXISTS') {
      return NextResponse.json(
        { error: { code, message: i18n.errors.barcodeExists } },
        { status: 409 }
      )
    }
    if (code === 'CATEGORY_NOT_FOUND') {
      return NextResponse.json(
        { error: { code, message: i18n.errors.categoryNotFound } },
        { status: 400 }
      )
    }
    console.error('[api/products POST] error:', err)
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: i18n.errors.serverError } },
      { status: 500 }
    )
  }
}
