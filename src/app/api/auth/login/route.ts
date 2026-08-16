import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { AuthService } from '@/services/auth.service'
import { createSession, setSessionCookie } from '@/lib/session'
import { i18n } from '@/lib/i18n'

const loginSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
})

const ERROR_MAP: Record<string, { status: number; message: string }> = {
  INVALID_CODE: { status: 401, message: i18n.errors.invalidLoginCode },
  USER_INACTIVE: { status: 401, message: i18n.errors.invalidLoginCode },
  STORE_INACTIVE: { status: 403, message: i18n.errors.storeInactive },
}

/** POST /api/auth/login — log in with a branch / personal password. */
export async function POST(req: NextRequest) {
  let parsed
  try {
    parsed = loginSchema.parse(await req.json())
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: i18n.errors.invalidLoginCode } },
      { status: 400 }
    )
  }

  try {
    const user = await AuthService.loginWithCode(parsed.code)
    const token = await createSession(
      user.id,
      user.phone,
      user.role,
      user.storeId ?? undefined
    )
    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        storeId: user.storeId,
        storeName: user.storeName,
      },
    })
    await setSessionCookie(response, token)
    return response
  } catch (err) {
    // Slow down brute-force attempts on the short numeric password.
    await new Promise((r) => setTimeout(r, 500))
    const code = err instanceof Error ? err.message : 'SERVER_ERROR'
    const mapped = ERROR_MAP[code]
    if (mapped) {
      return NextResponse.json(
        { error: { code, message: mapped.message } },
        { status: mapped.status }
      )
    }
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: i18n.errors.serverError } },
      { status: 500 }
    )
  }
}
