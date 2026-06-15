import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { CatalogService } from '@/services/catalog.service'
import { requireSession } from '@/lib/session'
import { i18n } from '@/lib/i18n'

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  sortOrder: z.number().int().optional(),
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

/** PUT /api/categories/[id] — update name / sort order. ADMIN only. */
export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { authenticated, error } = await requireSession(req, ['ADMIN'])
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

  const { id } = await ctx.params
  try {
    const category = await CatalogService.updateCategory(id, parsed)
    return NextResponse.json({ category })
  } catch (err) {
    const code = err instanceof Error ? err.message : 'SERVER_ERROR'
    if (code === 'CATEGORY_NOT_FOUND') {
      return NextResponse.json(
        { error: { code, message: i18n.errors.notFound } },
        { status: 404 }
      )
    }
    if (code === 'CATEGORY_NAME_EXISTS') {
      return NextResponse.json(
        { error: { code, message: i18n.admin.categories.nameExists } },
        { status: 409 }
      )
    }
    if (code === 'INVALID_NAME') {
      return NextResponse.json(
        { error: { code, message: i18n.errors.serverError } },
        { status: 400 }
      )
    }
    console.error('[api/categories/[id] PUT] error:', err)
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: i18n.errors.serverError } },
      { status: 500 }
    )
  }
}

/** DELETE /api/categories/[id] — delete a category (only if it has no
 *  products). ADMIN only. */
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { authenticated, error } = await requireSession(req, ['ADMIN'])
  if (!authenticated || error) return authError(error)

  const { id } = await ctx.params
  try {
    await CatalogService.removeCategory(id)
    return NextResponse.json({ success: true })
  } catch (err) {
    const code = err instanceof Error ? err.message : 'SERVER_ERROR'
    if (code === 'CATEGORY_NOT_FOUND') {
      return NextResponse.json(
        { error: { code, message: i18n.errors.notFound } },
        { status: 404 }
      )
    }
    if (code === 'CATEGORY_HAS_PRODUCTS') {
      return NextResponse.json(
        { error: { code, message: i18n.admin.categories.hasProducts } },
        { status: 409 }
      )
    }
    console.error('[api/categories/[id] DELETE] error:', err)
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: i18n.errors.serverError } },
      { status: 500 }
    )
  }
}
