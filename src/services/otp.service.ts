import { PrismaClient } from '@prisma/client'
import crypto from 'crypto'

const prisma = new PrismaClient()

export interface OtpRequestResult {
  success: boolean
  error?: string
  retryAfterSeconds?: number
  /** The generated code — present only on success, so callers can deliver it. */
  code?: string
  expiresInMinutes?: number
}

export interface OtpVerifyResult {
  success: boolean
  error?: string
  retryAfterSeconds?: number
}

/**
 * OTP issuance and verification, backed by the database (OtpCode table).
 *
 * A DB store is required on serverless platforms (Vercel): each request may
 * hit a different instance, so any in-memory store would lose codes between
 * the "request" and "verify" calls and logins would fail intermittently.
 *
 * One row per phone holds the active code, its expiry, the failed-verify
 * attempt count + lockout, and the recent request timestamps used for rate
 * limiting.
 */
export class OtpService {
  static readonly OTP_EXPIRY_MINUTES = parseInt(
    process.env.OTP_EXPIRY_MINUTES || '5'
  )
  static readonly OTP_DIGITS = parseInt(process.env.OTP_DIGITS || '6')
  static readonly MAX_REQUESTS_PER_10_MINUTES = parseInt(
    process.env.OTP_MAX_REQUESTS_PER_10_MINUTES || '3'
  )
  static readonly MAX_VERIFY_ATTEMPTS = parseInt(
    process.env.OTP_VERIFY_MAX_ATTEMPTS || '5'
  )
  static readonly VERIFY_LOCKOUT_MINUTES = parseInt(
    process.env.OTP_VERIFY_LOCKOUT_MINUTES || '15'
  )

  /**
   * Generate a random OTP code.
   *
   * When E2E_FIXED_OTP is set (E2E test runs only — never in production),
   * returns that fixed code so automated flows can log in deterministically.
   */
  static generateOtp(): string {
    // E2E_FIXED_OTP makes logins deterministic for automated tests.
    // Never honored in production, even if the env var is set by mistake.
    const fixed = process.env.E2E_FIXED_OTP
    if (fixed && process.env.NODE_ENV !== 'production') return fixed
    return crypto
      .randomInt(0, Math.pow(10, this.OTP_DIGITS))
      .toString()
      .padStart(this.OTP_DIGITS, '0')
  }

  /**
   * Issue an OTP code (with rate limiting). Returns the code on success so the
   * caller can deliver it (WhatsApp/SMS) — the code is stored only in the
   * OtpCode row.
   */
  static async requestOtp(phone: string): Promise<OtpRequestResult> {
    const now = new Date()

    // Check if phone is valid (Israeli phone format)
    if (!/^05\d{8}$/.test(phone)) {
      return { success: false, error: 'Phone format invalid' }
    }

    const existing = await prisma.otpCode.findUnique({ where: { phone } })

    // Check rate limit: max N requests per 10 minutes
    const tenMinutesAgo = now.getTime() - 10 * 60 * 1000
    const recent = (existing?.requestTimes ?? []).filter(
      (ts) => ts.getTime() > tenMinutesAgo
    )

    if (recent.length >= this.MAX_REQUESTS_PER_10_MINUTES) {
      const oldest = Math.min(...recent.map((d) => d.getTime()))
      const retryAfter = Math.ceil(
        (oldest + 10 * 60 * 1000 - now.getTime()) / 1000
      )
      return {
        success: false,
        error: 'Too many requests',
        retryAfterSeconds: Math.max(retryAfter, 1),
      }
    }

    const code = this.generateOtp()
    const expiresAt = new Date(now.getTime() + this.OTP_EXPIRY_MINUTES * 60 * 1000)
    const requestTimes = [...recent, now]

    // A fresh code starts a new verification window: reset attempts/lockout.
    await prisma.otpCode.upsert({
      where: { phone },
      create: { phone, code, expiresAt, requestTimes, attempts: 0, lockedUntil: null },
      update: { code, expiresAt, requestTimes, attempts: 0, lockedUntil: null },
    })

    return {
      success: true,
      code,
      expiresInMinutes: this.OTP_EXPIRY_MINUTES,
    }
  }

  /**
   * Verify an OTP code (with rate limiting and lockout)
   */
  static async verifyOtp(phone: string, code: string): Promise<OtpVerifyResult> {
    const now = new Date()

    const record = await prisma.otpCode.findUnique({ where: { phone } })

    // Locked out from too many failed attempts.
    if (record?.lockedUntil && record.lockedUntil > now) {
      const retryAfter = Math.ceil(
        (record.lockedUntil.getTime() - now.getTime()) / 1000
      )
      return { success: false, error: 'Too many attempts', retryAfterSeconds: retryAfter }
    }

    if (!record) {
      return { success: false, error: 'No OTP requested' }
    }

    // Expired code.
    if (record.expiresAt < now) {
      return { success: false, error: 'OTP expired' }
    }

    // Wrong code → increment attempts, lock out at the limit.
    if (record.code !== code) {
      const attempts = record.attempts + 1

      if (attempts >= this.MAX_VERIFY_ATTEMPTS) {
        await prisma.otpCode.update({
          where: { phone },
          data: {
            attempts,
            lockedUntil: new Date(
              now.getTime() + this.VERIFY_LOCKOUT_MINUTES * 60 * 1000
            ),
          },
        })
        return {
          success: false,
          error: 'Too many attempts',
          retryAfterSeconds: this.VERIFY_LOCKOUT_MINUTES * 60,
        }
      }

      await prisma.otpCode.update({
        where: { phone },
        data: { attempts, lockedUntil: null },
      })
      return { success: false, error: 'Invalid OTP' }
    }

    // Correct! Clear the row so the code can't be reused.
    await prisma.otpCode.delete({ where: { phone } })
    return { success: true }
  }

  /**
   * Get user by phone (for login)
   */
  static async getUserByPhone(phone: string) {
    return prisma.user.findUnique({
      where: { phone },
      include: {
        store: true,
      },
    })
  }

  /**
   * Clear all OTP data (for testing).
   */
  static async clearAll() {
    await prisma.otpCode.deleteMany()
  }
}
