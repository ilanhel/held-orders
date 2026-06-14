import { NextRequest, NextResponse } from 'next/server'
import { CatalogService } from '@/services/catalog.service'
import { StorageService } from '@/services/storage'
import { requireSession } from '@/lib/session'
import { i18n } from '@/lib/i18n'

/** Allowed image MIME types and their file extension. */
const ALLOWED: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}
const MAX_BYTES = 5 * 1024 * 1024 // 5MB

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
 * POST /api/products/[id]/image — upload a product image (multipart, field
 * "file"). ADMIN only. Stores the object via StorageService and saves the
 * resulting URL on the product.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { authenticated, error } = await requireSession(req, ['ADMIN'])
  if (!authenticated || error) return authError(error)

  const { id } = await ctx.params

  let file: File | null = null
  try {
    const form = await req.formData()
    const value = form.get('file')
    if (value instanceof File) file = value
  } catch {
    file = null
  }

  if (!file) {
    return NextResponse.json(
      { error: { code: 'NO_FILE', message: i18n.admin.catalog.imageError } },
      { status: 400 }
    )
  }

  const ext = ALLOWED[file.type]
  if (!ext) {
    return NextResponse.json(
      { error: { code: 'BAD_TYPE', message: i18n.admin.catalog.imageBadType } },
      { status: 400 }
    )
  }

  if (file.size === 0 || file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: { code: 'TOO_LARGE', message: i18n.admin.catalog.imageTooLarge } },
      { status: 400 }
    )
  }

  try {
    const data = Buffer.from(await file.arrayBuffer())
    const key = `products/${id}-${Date.now()}.${ext}`
    const { url } = await StorageService.upload({
      key,
      data,
      contentType: file.type,
    })
    const product = await CatalogService.setImage(id, url)
    return NextResponse.json({ product })
  } catch (err) {
    const code = err instanceof Error ? err.message : 'SERVER_ERROR'
    if (code === 'PRODUCT_NOT_FOUND') {
      return NextResponse.json(
        { error: { code, message: i18n.errors.notFound } },
        { status: 404 }
      )
    }
    if (code === 'BLOB_NOT_CONFIGURED') {
      return NextResponse.json(
        { error: { code, message: i18n.admin.catalog.imageError } },
        { status: 503 }
      )
    }
    console.error('[api/products/[id]/image POST] error:', err)
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: i18n.errors.serverError } },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/products/[id]/image — remove a product's image. ADMIN only.
 */
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { authenticated, error } = await requireSession(req, ['ADMIN'])
  if (!authenticated || error) return authError(error)

  const { id } = await ctx.params
  try {
    const product = await CatalogService.setImage(id, null)
    return NextResponse.json({ product })
  } catch (err) {
    const code = err instanceof Error ? err.message : 'SERVER_ERROR'
    if (code === 'PRODUCT_NOT_FOUND') {
      return NextResponse.json(
        { error: { code, message: i18n.errors.notFound } },
        { status: 404 }
      )
    }
    console.error('[api/products/[id]/image DELETE] error:', err)
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: i18n.errors.serverError } },
      { status: 500 }
    )
  }
}
