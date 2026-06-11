import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { OtpService, otpStore } from '@/services/otp.service'
import { createSession } from '@/lib/session'
import { cookies } from 'next/headers'
import { i18n } from '@/lib/i18n'

const requestSchema = z.object({
  phone: z.string().regex(/^05\d{8}$/, 'Invalid Israeli phone number'),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { phone } = requestSchema.parse(body)

    const result = OtpService.requestOtp(phone)

    if (!result.success) {
      const status = result.error === 'Too many requests' ? 429 : 400
      return NextResponse.json(
        {
          error: {
            code: result.error,
            message: i18n.errors[result.error as keyof typeof i18n.errors] || result.error,
          },
        },
        { status }
      )
    }

    // In production, send via WhatsApp/SMS
    // For dev, log to console or return the code
    if (process.env.NODE_ENV === 'development') {
      const code = otpStore.get(phone)?.code
      console.log(`[DEV OTP] Phone: ${phone}, Code: ${code || 'N/A'}`)
    }

    // Demo mode: log the user in directly, with no OTP code step.
    // The in-memory OTP store is not reliable on serverless (each request may
    // hit a different instance), so for shareable TEST links we skip the code
    // entirely. Opt-in only via DEMO_MODE — never on a real production deploy.
    if (process.env.DEMO_MODE === 'true') {
      const user = await OtpService.getUserByPhone(phone)
      if (!user || !user.active) {
        return NextResponse.json(
          {
            error: { code: 'USER_NOT_FOUND', message: i18n.errors.notFound },
          },
          { status: 404 }
        )
      }

      const token = await createSession(
        user.id,
        user.phone,
        user.role,
        user.storeId || undefined
      )

      const response = NextResponse.json({
        success: true,
        demoLogin: true,
        user: {
          id: user.id,
          name: user.name,
          phone: user.phone,
          role: user.role,
          storeId: user.storeId,
          storeName: user.store?.name,
        },
      })

      const cookieStore = await cookies()
      const maxAge =
        parseInt(process.env.SESSION_MAX_AGE_DAYS || '90') * 24 * 60 * 60
      cookieStore.set('session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge,
      })

      return response
    }

    return NextResponse.json({
      success: true,
      message: i18n.auth.otpSent,
    })
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

    console.error('OTP request error:', error)
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
