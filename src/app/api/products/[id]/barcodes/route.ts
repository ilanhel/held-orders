import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { CatalogService } from '@/services/catalog.service'
import { requireSession } from '@/lib/session'
import { i18n } from '@/lib/i18n'

const addSchema = z.object({
  barcode: z.string().min(1).max(64),
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
 * GET /api/products/[id]/barcodes — list barcode variants. ADMIN/WAREHOUSE.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { authenticated, error } = await requireSession(req, ['ADMIN', 'WAREHOUSE'])
  if (!authenticated || error) return authError(error)

  const { id } = await ctx.params
  try {
    const barcodes = await CatalogService.listBarcodes(id)
    return NextResponse.json({ barcodes })
  } catch (err) {
    const code = err instanceof Error ? err.message : 'SERVER_ERROR'
    if (code === 'PRODUCT_NOT_FOUND') {
      return NextResponse.json(
        { error: { code, message: i18n.errors.notFound } },
        { status: 404 }
      )
    }
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: i18n.errors.serverError } },
      { status: 500 }
    )
  }
}

/**
 * POST /api/products/[id]/barcodes — add a barcode variant. ADMIN/WAREHOUSE.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { authenticated, error } = await requireSession(req, ['ADMIN', 'WAREHOUSE'])
  if (!authenticated || error) return authError(error)

  let parsed
  try {
    parsed = addSchema.parse(await req.json())
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: i18n.errors.serverError } },
      { status: 400 }
    )
  }

  const { id } = await ctx.params
  try {
    const barcodes = await CatalogService.addBarcode(id, parsed.barcode)
    return NextResponse.json({ barcodes }, { status: 201 })
  } catch (err) {
    const code = err instanceof Error ? err.message : 'SERVER_ERROR'
    if (code === 'PRODUCT_NOT_FOUND') {
      return NextResponse.json(
        { error: { code, message: i18n.errors.notFound } },
        { status: 404 }
      )
    }
    if (code === 'BARCODE_EXISTS') {
      return NextResponse.json(
        { error: { code, message: i18n.errors.barcodeExists } },
        { status: 409 }
      )
    }
    if (code === 'INVALID_BARCODE') {
      return NextResponse.json(
        { error: { code, message: i18n.errors.serverError } },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: i18n.errors.serverError } },
      { status: 500 }
    )
  }
}
