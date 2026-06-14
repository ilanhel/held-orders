import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Role } from '@prisma/client'
import { UserService } from '@/services/user.service'
import { requireSession } from '@/lib/session'
import { i18n } from '@/lib/i18n'

const createSchema = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().min(1).max(20),
  role: z.nativeEnum(Role),
  storeId: z.string().min(1).nullable().optional(),
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
    INVALID_NAME: { message: i18n.errors.serverError, status: 400 },
    STORE_REQUIRED: { message: i18n.admin.users.storeRequired, status: 400 },
    STORE_NOT_FOUND: { message: i18n.errors.invalidStore, status: 400 },
    USER_NOT_FOUND: { message: i18n.errors.notFound, status: 404 },
  }
  return map[code]
}

/** GET /api/users — list users. Optional ?role=FRANCHISEE. ADMIN only. */
export async function GET(req: NextRequest) {
  const { authenticated, error } = await requireSession(req, ['ADMIN'])
  if (!authenticated || error) return authError(error)

  const { searchParams } = new URL(req.url)
  const roleParam = searchParams.get('role')
  const role = roleParam && roleParam in Role ? (roleParam as Role) : undefined

  try {
    const users = await UserService.list(role)
    return NextResponse.json({ users })
  } catch (err) {
    console.error('[api/users GET] error:', err)
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: i18n.errors.serverError } },
      { status: 500 }
    )
  }
}

/** POST /api/users — create a user. ADMIN only. */
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
    const user = await UserService.create(parsed)
    return NextResponse.json({ user }, { status: 201 })
  } catch (err) {
    const code = err instanceof Error ? err.message : 'SERVER_ERROR'
    const mapped = mapError(code)
    if (mapped) {
      return NextResponse.json(
        { error: { code, message: mapped.message } },
        { status: mapped.status }
      )
    }
    console.error('[api/users POST] error:', err)
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: i18n.errors.serverError } },
      { status: 500 }
    )
  }
}
