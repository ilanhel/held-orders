import { PrismaClient } from '@prisma/client'
import crypto from 'crypto'

const prisma = new PrismaClient()

export interface OtpAttempt {
  phone: string
  code: string
  expiresAt: Date
  createdAt: Date
}

export interface VerifyAttempt {
  phone: string
  attempts: number
  lockedUntil: Date | null
}

/**
 * In-memory stores for OTP and verification attempts
 * In production, these would be in Redis or a database
 */
export const otpStore = new Map<string, OtpAttempt>()
export const verifyAttemptStore = new Map<string, VerifyAttempt>()
export const requestTimestamps = new Map<string, number[]>() // phone -> array of request timestamps

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
   * Request an OTP code (with rate limiting)
   */
  static requestOtp(phone: string): {
    success: boolean
    error?: string
    retryAfterSeconds?: number
  } {
    const now = new Date()

    // Check if phone is valid (Israeli phone format)
    if (!/^05\d{8}$/.test(phone)) {
      return { success: false, error: 'Phone format invalid' }
    }

    // Check rate limit: max N requests per 10 minutes
    const tenMinutesAgo = now.getTime() - 10 * 60 * 1000
    const timestamps = requestTimestamps.get(phone) || []
    const recentTimestamps = timestamps.filter((ts) => ts > tenMinutesAgo)

    if (recentTimestamps.length >= this.MAX_REQUESTS_PER_10_MINUTES) {
      const oldestTimestamp = Math.min(...recentTimestamps)
      const retryAfter = Math.ceil(
        (oldestTimestamp + 10 * 60 * 1000 - now.getTime()) / 1000
      )
      return {
        success: false,
        error: 'Too many requests',
        retryAfterSeconds: Math.max(retryAfter, 1),
      }
    }

    // Record this request timestamp
    recentTimestamps.push(now.getTime())
    requestTimestamps.set(phone, recentTimestamps)

    // Generate OTP
    const code = this.generateOtp()
    const expiresAt = new Date(now.getTime() + this.OTP_EXPIRY_MINUTES * 60 * 1000)

    otpStore.set(phone, {
      phone,
      code,
      expiresAt,
      createdAt: now,
    })

    return { success: true }
  }

  /**
   * Verify an OTP code (with rate limiting and lockout)
   */
  static verifyOtp(phone: string, code: string): {
    success: boolean
    error?: string
    retryAfterSeconds?: number
  } {
    const now = new Date()

    // Check if phone is locked out
    const verifyAttempt = verifyAttemptStore.get(phone)
    if (verifyAttempt?.lockedUntil && verifyAttempt.lockedUntil > now) {
      const retryAfter = Math.ceil(
        (verifyAttempt.lockedUntil.getTime() - now.getTime()) / 1000
      )
      return {
        success: false,
        error: 'Too many attempts',
        retryAfterSeconds: retryAfter,
      }
    }

    // Get the OTP for this phone
    const otpAttempt = otpStore.get(phone)
    if (!otpAttempt) {
      return { success: false, error: 'No OTP requested' }
    }

    // Check if OTP expired
    if (otpAttempt.expiresAt < now) {
      otpStore.delete(phone)
      return { success: false, error: 'OTP expired' }
    }

    // Check if code is correct
    if (otpAttempt.code !== code) {
      // Increment failed attempts
      const attempts = (verifyAttempt?.attempts || 0) + 1

      if (attempts >= this.MAX_VERIFY_ATTEMPTS) {
        // Lock out for 15 minutes
        verifyAttemptStore.set(phone, {
          phone,
          attempts,
          lockedUntil: new Date(now.getTime() + this.VERIFY_LOCKOUT_MINUTES * 60 * 1000),
        })
        return {
          success: false,
          error: 'Too many attempts',
          retryAfterSeconds: this.VERIFY_LOCKOUT_MINUTES * 60,
        }
      }

      // Update attempt count
      verifyAttemptStore.set(phone, {
        phone,
        attempts,
        lockedUntil: null,
      })

      return { success: false, error: 'Invalid OTP' }
    }

    // OTP is correct! Clear attempts and OTP
    otpStore.delete(phone)
    verifyAttemptStore.delete(phone)

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
   * Clear all OTP data (for testing)
   */
  static clearAll() {
    otpStore.clear()
    verifyAttemptStore.clear()
    requestTimestamps.clear()
  }
}
