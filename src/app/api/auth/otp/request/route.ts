import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { OtpService, otpStore } from '@/services/otp.service'
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

    // Demo mode: surface the code to the client so a shared test link works
    // without a real WhatsApp/SMS provider. Opt-in only — never on by default.
    const demoCode =
      process.env.DEMO_MODE === 'true' ? otpStore.get(phone)?.code : undefined

    return NextResponse.json({
      success: true,
      message: i18n.auth.otpSent,
      ...(demoCode ? { demoCode } : {}),
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
