import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { OtpService } from '@/services/otp.service'
import { createSession } from '@/lib/session'
import { i18n } from '@/lib/i18n'
import { cookies } from 'next/headers'

const verifySchema = z.object({
  phone: z.string().regex(/^05\d{8}$/, 'Invalid phone number'),
  code: z.string().length(6, 'Code must be 6 digits'),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { phone, code } = verifySchema.parse(body)

    // Verify OTP
    const verifyResult = OtpService.verifyOtp(phone, code)
    if (!verifyResult.success) {
      const status = verifyResult.error === 'Too many attempts' ? 429 : 401
      return NextResponse.json(
        {
          error: {
            code: verifyResult.error,
            message: i18n.errors[verifyResult.error as keyof typeof i18n.errors] || verifyResult.error,
          },
        },
        { status }
      )
    }

    // Get user by phone
    const user = await OtpService.getUserByPhone(phone)
    if (!user || !user.active) {
      return NextResponse.json(
        {
          error: {
            code: 'USER_NOT_FOUND',
            message: i18n.errors.notFound,
          },
        },
        { status: 404 }
      )
    }

    // Create session
    const token = await createSession(user.id, user.phone, user.role, user.storeId || undefined)

    // Set session cookie
    let response = NextResponse.json({
      success: true,
      message: i18n.auth.loginSuccess,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: user.role,
        storeId: user.storeId,
        storeName: user.store?.name,
      },
    })

    // Set the session cookie
    const cookieStore = await cookies()
    const maxAge = parseInt(process.env.SESSION_MAX_AGE_DAYS || '90') * 24 * 60 * 60
    cookieStore.set('session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge,
    })

    return response
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: error.errors[0].message,
          },
        },
        { status: 400 }
      )
    }

    console.error('OTP verify error:', error)
    return NextResponse.json(
      {
        error: {
          code: 'SERVER_ERROR',
          message: i18n.errors.serverError,
        },
      },
      { status: 500 }
    )
  }
}
