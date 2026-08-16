import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { jwtVerify, SignJWT } from 'jose'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const rawSecret = process.env.SESSION_SECRET

// Fail fast in production if no secret is configured — otherwise sessions
// would be signed with a public, hardcoded key and could be forged.
if (!rawSecret && process.env.NODE_ENV === 'production') {
  throw new Error(
    'SESSION_SECRET environment variable is required in production'
  )
}

const secret = new TextEncoder().encode(rawSecret || 'dev-secret-key')

export interface SessionData {
  userId: string
  phone: string
  role: 'FRANCHISEE' | 'WAREHOUSE' | 'ADMIN'
  storeId?: string
}

/**
 * Create a session token
 */
export async function createSession(
  userId: string,
  phone: string,
  role: string,
  storeId?: string
): Promise<string> {
  const maxAge = (parseInt(process.env.SESSION_MAX_AGE_DAYS || '90') * 24 * 60 * 60 * 1000) / 1000 // in seconds
  
  const token = await new SignJWT({
    userId,
    phone,
    role,
    storeId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(Math.floor(Date.now() / 1000) + maxAge)
    .sign(secret)

  return token
}

/**
 * Verify and extract session data from token
 */
export async function verifySession(token: string): Promise<SessionData | null> {
  try {
    const verified = await jwtVerify(token, secret)
    return verified.payload as unknown as SessionData
  } catch {
    return null
  }
}

/**
 * Middleware to protect routes.
 * The session token only identifies the user — the role, active flag and
 * store are re-read from the DB on every request, so demoting or
 * deactivating a user takes effect immediately (not when the long-lived
 * session token happens to expire).
 */
export async function requireSession(
  request: NextRequest,
  allowedRoles?: string[]
) {
  const cookieStore = await cookies()
  const sessionToken = cookieStore.get('session')?.value

  if (!sessionToken) {
    return {
      authenticated: false,
      session: null,
      error: 'Unauthorized',
    }
  }

  const session = await verifySession(sessionToken)
  if (!session) {
    return {
      authenticated: false,
      session: null,
      error: 'Invalid session',
    }
  }

  // Fresh authorization data from the DB (never trust the token's role).
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { phone: true, role: true, storeId: true, active: true },
  })
  if (!user || !user.active) {
    return {
      authenticated: false,
      session: null,
      error: 'Unauthorized',
    }
  }

  const fresh: SessionData = {
    userId: session.userId,
    phone: user.phone,
    role: user.role,
    storeId: user.storeId ?? session.storeId,
  }

  if (allowedRoles && !allowedRoles.includes(fresh.role)) {
    return {
      authenticated: true,
      session: fresh,
      error: 'Forbidden',
    }
  }

  return {
    authenticated: true,
    session: fresh,
    error: null,
  }
}

/**
 * Set session cookie
 */
export async function setSessionCookie(
  response: NextResponse,
  token: string
) {
  const maxAge = parseInt(process.env.SESSION_MAX_AGE_DAYS || '90') * 24 * 60 * 60

  const cookieStore = await cookies()
  cookieStore.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge,
  })

  return response
}

/**
 * Clear session cookie
 */
export async function clearSessionCookie(response: NextResponse) {
  const cookieStore = await cookies()
  cookieStore.set('session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
  })

  return response
}
