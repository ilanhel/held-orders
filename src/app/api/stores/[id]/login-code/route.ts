import { NextRequest, NextResponse } from 'next/server'
import { AuthService } from '@/services/auth.service'
import { requireSession } from '@/lib/session'
import { i18n } from '@/lib/i18n'

/** POST /api/stores/[id]/login-code — issue a new branch password. ADMIN only. */
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
    const loginCode = await AuthService.issueStoreCode(id)
    return NextResponse.json({ loginCode })
  } catch (err) {
    const code = err instanceof Error ? err.message : 'SERVER_ERROR'
    if (code === 'STORE_NOT_FOUND') {
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
