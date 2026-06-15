import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { CatalogService } from '@/services/catalog.service'
import { requireSession } from '@/lib/session'
import { i18n } from '@/lib/i18n'

const createSchema = z.object({
  name: z.string().min(1).max(120),
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

/** GET /api/categories — list all categories with product counts. ADMIN only. */
export async function GET(req: NextRequest) {
  const { authenticated, error } = await requireSession(req, ['ADMIN'])
  if (!authenticated || error) return authError(error)

  try {
    const categories = await CatalogService.listCategories()
    return NextResponse.json({ categories })
  } catch (err) {
    console.error('[api/categories GET] error:', err)
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: i18n.errors.serverError } },
      { status: 500 }
    )
  }
}

/** POST /api/categories — create a category. ADMIN only. */
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
    const category = await CatalogService.createCategory(parsed)
    return NextResponse.json({ category }, { status: 201 })
  } catch (err) {
    const code = err instanceof Error ? err.message : 'SERVER_ERROR'
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
    console.error('[api/categories POST] error:', err)
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: i18n.errors.serverError } },
      { status: 500 }
    )
  }
}
