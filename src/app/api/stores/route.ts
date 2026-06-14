import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { StoreService } from '@/services/store.service'
import { requireSession } from '@/lib/session'
import { i18n } from '@/lib/i18n'

const createSchema = z.object({
  name: z.string().min(1).max(120),
  code: z.string().min(1).max(40),
  phone: z.string().min(1).max(20),
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
    STORE_CODE_EXISTS: { message: i18n.admin.stores.codeExists, status: 409 },
    INVALID_PHONE: { message: i18n.errors.invalidPhone, status: 400 },
    INVALID_NAME: { message: i18n.errors.serverError, status: 400 },
    INVALID_CODE: { message: i18n.errors.serverError, status: 400 },
    STORE_NOT_FOUND: { message: i18n.errors.notFound, status: 404 },
  }
  return map[code]
}

/** GET /api/stores — list all branches. ADMIN only. */
export async function GET(req: NextRequest) {
  const { authenticated, error } = await requireSession(req, ['ADMIN'])
  if (!authenticated || error) return authError(error)

  try {
    const stores = await StoreService.list()
    return NextResponse.json({ stores })
  } catch (err) {
    console.error('[api/stores GET] error:', err)
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: i18n.errors.serverError } },
      { status: 500 }
    )
  }
}

/** POST /api/stores — create a branch. ADMIN only. */
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
    const store = await StoreService.create(parsed)
    return NextResponse.json({ store }, { status: 201 })
  } catch (err) {
    const code = err instanceof Error ? err.message : 'SERVER_ERROR'
    const mapped = mapError(code)
    if (mapped) {
      return NextResponse.json(
        { error: { code, message: mapped.message } },
        { status: mapped.status }
      )
    }
    console.error('[api/stores POST] error:', err)
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: i18n.errors.serverError } },
      { status: 500 }
    )
  }
}
