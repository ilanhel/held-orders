import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { UserService } from '@/services/user.service'
import { requireSession } from '@/lib/session'
import { i18n } from '@/lib/i18n'

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  phone: z.string().min(1).max(20).optional(),
  storeId: z.string().min(1).nullable().optional(),
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

function mapError(code: string) {
  const map: Record<string, { message: string; status: number }> = {
    PHONE_EXISTS: { message: i18n.admin.users.phoneExists, status: 409 },
    INVALID_PHONE: { message: i18n.errors.invalidPhone, status: 400 },
    STORE_NOT_FOUND: { message: i18n.errors.invalidStore, status: 400 },
    USER_NOT_FOUND: { message: i18n.errors.notFound, status: 404 },
  }
  return map[code]
}

/** PUT /api/users/[id] — update a user. ADMIN only. */
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
    const user = await UserService.update(id, parsed)
    return NextResponse.json({ user })
  } catch (err) {
    const code = err instanceof Error ? err.message : 'SERVER_ERROR'
    const mapped = mapError(code)
    if (mapped) {
      return NextResponse.json(
        { error: { code, message: mapped.message } },
        { status: mapped.status }
      )
    }
    console.error('[api/users/[id] PUT] error:', err)
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: i18n.errors.serverError } },
      { status: 500 }
    )
  }
}
