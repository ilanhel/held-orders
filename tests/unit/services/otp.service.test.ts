import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { OtpService } from '@/services/otp.service'

const prisma = new PrismaClient()

describe('OtpService', () => {
  beforeEach(async () => {
    await OtpService.clearAll()
  })

  afterAll(async () => {
    await prisma.$disconnect()
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
    it('returns success and the code for a valid phone', async () => {
      const result = await OtpService.requestOtp('0550000001')
      expect(result.success).toBe(true)
      expect(result.error).toBeUndefined()
      expect(result.code).toMatch(/^\d{6}$/)
    })

    it('rejects invalid phone format', async () => {
      const result = await OtpService.requestOtp('123')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Phone format invalid')
    })

    it('enforces rate limit (3 per 10 minutes)', async () => {
      const phone = '0550000001'

      // First 3 requests should succeed
      expect((await OtpService.requestOtp(phone)).success).toBe(true)
      expect((await OtpService.requestOtp(phone)).success).toBe(true)
      expect((await OtpService.requestOtp(phone)).success).toBe(true)

      // 4th request should fail
      const result = await OtpService.requestOtp(phone)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Too many requests')
      expect(result.retryAfterSeconds).toBeDefined()
    })
  })

  describe('verifyOtp', () => {
    it('verifies correct OTP code', async () => {
      const phone = '0550000001'
      const { code } = await OtpService.requestOtp(phone)
      expect(code).toBeDefined()

      const result = await OtpService.verifyOtp(phone, code!)
      expect(result.success).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('rejects incorrect OTP code', async () => {
      const phone = '0550000001'
      await OtpService.requestOtp(phone)

      const result = await OtpService.verifyOtp(phone, '000000')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid OTP')
    })

    it('returns error if no OTP requested', async () => {
      const result = await OtpService.verifyOtp('0550000001', '123456')
      expect(result.success).toBe(false)
      expect(result.error).toBe('No OTP requested')
    })

    it('locks out after 5 failed attempts', async () => {
      const phone = '0550000001'
      await OtpService.requestOtp(phone)

      // Make 5 failed attempts
      for (let i = 0; i < 5; i++) {
        await OtpService.verifyOtp(phone, '000000')
      }

      // Next attempt should be blocked by lockout
      const result = await OtpService.verifyOtp(phone, '000000')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Too many attempts')
      expect(result.retryAfterSeconds).toBeDefined()
    })

    it('enforces lockout period after too many attempts', async () => {
      const phone = '0550000001'
      await OtpService.requestOtp(phone)

      // Make 5 failed attempts to trigger lockout
      for (let i = 0; i < 5; i++) {
        await OtpService.verifyOtp(phone, '000000')
      }

      // Subsequent attempts should be blocked
      const result = await OtpService.verifyOtp(phone, '000000')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Too many attempts')
    })

    it('clears OTP after successful verification', async () => {
      const phone = '0550000001'
      const { code } = await OtpService.requestOtp(phone)
      expect(code).toBeDefined()

      await OtpService.verifyOtp(phone, code!)

      // OTP row should be cleared
      const row = await prisma.otpCode.findUnique({ where: { phone } })
      expect(row).toBeNull()
    })

    it('expires OTP after configured time', async () => {
      const phone = '0550000001'
      await OtpService.requestOtp(phone)

      // Manually expire the OTP in the DB
      await prisma.otpCode.update({
        where: { phone },
        data: { expiresAt: new Date(Date.now() - 1000) },
      })

      const result = await OtpService.verifyOtp(phone, '000000')
      expect(result.success).toBe(false)
      expect(result.error).toBe('OTP expired')
    })
  })
})
