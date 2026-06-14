import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { StoreService } from '@/services/store.service'
import { requireSession } from '@/lib/session'
import { i18n } from '@/lib/i18n'

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  phone: z.string().min(1).max(20).optional(),
  active: z.boolean().optional(),
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

/** PUT /api/stores/[id] — update a branch. ADMIN only. */
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
    const store = await StoreService.update(id, parsed)
    return NextResponse.json({ store })
  } catch (err) {
    const code = err instanceof Error ? err.message : 'SERVER_ERROR'
    if (code === 'STORE_NOT_FOUND') {
      return NextResponse.json(
        { error: { code, message: i18n.errors.notFound } },
        { status: 404 }
      )
    }
    if (code === 'INVALID_PHONE') {
      return NextResponse.json(
        { error: { code, message: i18n.errors.invalidPhone } },
        { status: 400 }
      )
    }
    console.error('[api/stores/[id] PUT] error:', err)
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: i18n.errors.serverError } },
      { status: 500 }
    )
  }
}

/** DELETE /api/stores/[id] — permanently delete a branch (only if it has no
 *  orders). ADMIN only. */
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { authenticated, error } = await requireSession(req, ['ADMIN'])
  if (!authenticated || error) return authError(error)

  const { id } = await ctx.params
  try {
    await StoreService.remove(id)
    return NextResponse.json({ success: true })
  } catch (err) {
    const code = err instanceof Error ? err.message : 'SERVER_ERROR'
    if (code === 'STORE_NOT_FOUND') {
      return NextResponse.json(
        { error: { code, message: i18n.errors.notFound } },
        { status: 404 }
      )
    }
    if (code === 'STORE_HAS_ORDERS') {
      return NextResponse.json(
        { error: { code, message: i18n.admin.stores.hasOrders } },
        { status: 409 }
      )
    }
    console.error('[api/stores/[id] DELETE] error:', err)
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: i18n.errors.serverError } },
      { status: 500 }
    )
  }
}
