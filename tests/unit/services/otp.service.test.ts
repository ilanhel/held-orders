import { describe, it, expect, beforeEach } from 'vitest'
import { OtpService, otpStore } from '@/services/otp.service'

describe('OtpService', () => {
  beforeEach(() => {
    OtpService.clearAll()
  })

  describe('generateOtp', () => {
    it('generates a 6-digit code', () => {
      const code = OtpService.generateOtp()
      expect(code).toMatch(/^\d{6}$/)
    })

    it('generates different codes on multiple calls', () => {
      const codes = new Set([
        OtpService.generateOtp(),
        OtpService.generateOtp(),
        OtpService.generateOtp(),
      ])
      expect(codes.size).toBeGreaterThan(1)
    })
  })

  describe('requestOtp', () => {
    it('returns success for valid phone', () => {
      const result = OtpService.requestOtp('0550000001')
      expect(result.success).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('rejects invalid phone format', () => {
      const result = OtpService.requestOtp('123')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Phone format invalid')
    })

    it('enforces rate limit (3 per 10 minutes)', () => {
      const phone = '0550000001'

      // First 3 requests should succeed
      expect(OtpService.requestOtp(phone).success).toBe(true)
      expect(OtpService.requestOtp(phone).success).toBe(true)
      expect(OtpService.requestOtp(phone).success).toBe(true)

      // 4th request should fail
      const result = OtpService.requestOtp(phone)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Too many requests')
      expect(result.retryAfterSeconds).toBeDefined()
    })
  })

  describe('verifyOtp', () => {
    it('verifies correct OTP code', () => {
      const phone = '0550000001'
      OtpService.requestOtp(phone)

      // Get the generated code (for testing)
      const code = otpStore.get(phone)?.code
      expect(code).toBeDefined()

      const result = OtpService.verifyOtp(phone, code!)
      expect(result.success).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('rejects incorrect OTP code', () => {
      const phone = '0550000001'
      OtpService.requestOtp(phone)

      const result = OtpService.verifyOtp(phone, '000000')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid OTP')
    })

    it('returns error if no OTP requested', () => {
      const result = OtpService.verifyOtp('0550000001', '123456')
      expect(result.success).toBe(false)
      expect(result.error).toBe('No OTP requested')
    })

    it('locks out after 5 failed attempts', () => {
      const phone = '0550000001'
      OtpService.requestOtp(phone)

      // Make 5 failed attempts
      for (let i = 0; i < 5; i++) {
        OtpService.verifyOtp(phone, '000000')
      }

      // 5th attempt should result in lockout
      const result = OtpService.verifyOtp(phone, '000000')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Too many attempts')
      expect(result.retryAfterSeconds).toBeDefined()
    })

    it('enforces lockout period after too many attempts', () => {
      const phone = '0550000001'
      OtpService.requestOtp(phone)

      // Make 5 failed attempts to trigger lockout
      for (let i = 0; i < 5; i++) {
        OtpService.verifyOtp(phone, '000000')
      }

      // Subsequent attempts should be blocked
      const result = OtpService.verifyOtp(phone, '000000')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Too many attempts')
    })

    it('clears OTP after successful verification', () => {
      const phone = '0550000001'
      OtpService.requestOtp(phone)

      const code = otpStore.get(phone)?.code
      expect(code).toBeDefined()

      OtpService.verifyOtp(phone, code!)

      // OTP should be cleared
      expect(otpStore.has(phone)).toBe(false)
    })

    it('expires OTP after configured time', () => {
      const phone = '0550000001'
      OtpService.requestOtp(phone)

      // Manually expire the OTP
      const otpAttempt = otpStore.get(phone)
      expect(otpAttempt).toBeDefined()
      if (otpAttempt) {
        otpAttempt.expiresAt = new Date(Date.now() - 1000) // 1 second in the past
      }

      const result = OtpService.verifyOtp(phone, '000000')
      expect(result.success).toBe(false)
      expect(result.error).toBe('OTP expired')
    })
  })
})
