import { NextRequest, NextResponse } from 'next/server'
import { AuthService } from '@/services/auth.service'
import { requireSession } from '@/lib/session'
import { i18n } from '@/lib/i18n'

/** POST /api/users/[id]/login-code — issue a new personal password (WAREHOUSE/ADMIN users). ADMIN only. */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { authenticated, error } = await requireSession(req, ['ADMIN'])
  if (!authenticated || error) {
    return NextResponse.json(
      {
        error:
          error === 'Forbidden'
            ? { code: 'FORBIDDEN', message: i18n.errors.forbidden }
            : { code: 'UNAUTHORIZED', message: i18n.errors.unauthorized },
      },
      { status: error === 'Forbidden' ? 403 : 401 }
    )
  }

  const { id } = await ctx.params
  try {
    const loginCode = await AuthService.issueUserCode(id)
    return NextResponse.json({ loginCode })
  } catch (err) {
    const code = err instanceof Error ? err.message : 'SERVER_ERROR'
    if (code === 'USER_NOT_FOUND') {
      return NextResponse.json(
        { error: { code, message: i18n.errors.notFound } },
        { status: 404 }
      )
    }
    if (code === 'FRANCHISEE_USES_STORE_CODE') {
      return NextResponse.json(
        { error: { code, message: i18n.admin.users.franchiseeUsesStoreCode } },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: i18n.errors.serverError } },
      { status: 500 }
    )
  }
}
