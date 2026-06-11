import { NextRequest, NextResponse } from 'next/server'
import { i18n } from '@/lib/i18n'
import { cookies } from 'next/headers'

export async function POST(_req: NextRequest) {
  try {
    const cookieStore = await cookies()
    cookieStore.set('session', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
    })

    return NextResponse.json({
      success: true,
      message: i18n.auth.logoutSuccess,
    })
  } catch (error) {
    console.error('Logout error:', error)
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
