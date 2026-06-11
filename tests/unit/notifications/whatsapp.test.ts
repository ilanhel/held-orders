import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { WhatsAppDriver } from '@/services/notifications/whatsapp'

describe('WhatsAppDriver', () => {
  describe('normalizePhone', () => {
    it('converts Israeli 05X format to 9725X', () => {
      expect(WhatsAppDriver.normalizePhone('0501234567')).toBe('972501234567')
    })

    it('strips dashes and spaces', () => {
      expect(WhatsAppDriver.normalizePhone('050-123-4567')).toBe('972501234567')
      expect(WhatsAppDriver.normalizePhone('050 123 4567')).toBe('972501234567')
    })

    it('passes through already-international 972 numbers', () => {
      expect(WhatsAppDriver.normalizePhone('972501234567')).toBe('972501234567')
      expect(WhatsAppDriver.normalizePhone('+972501234567')).toBe('972501234567')
    })

    it('strips non-digits from other formats', () => {
      expect(WhatsAppDriver.normalizePhone('+1 (555) 123-4567')).toBe('15551234567')
    })
  })

  describe('send', () => {
    const originalEnv = process.env

    beforeEach(() => {
      process.env = { ...originalEnv }
      delete process.env.WHATSAPP_PHONE_NUMBER_ID
      delete process.env.WHATSAPP_BEARER_TOKEN
      vi.restoreAllMocks()
    })

    afterEach(() => {
      process.env = originalEnv
      vi.restoreAllMocks()
    })

    it('returns WHATSAPP_NOT_CONFIGURED when env is missing', async () => {
      const driver = new WhatsAppDriver()
      const result = await driver.send(
        { type: 'ORDER_RECEIVED', orderNumber: 1001 },
        { phone: '0501234567' }
      )
      expect(result.success).toBe(false)
      expect(result.error).toBe('WHATSAPP_NOT_CONFIGURED')
    })

    it('posts to the Graph API endpoint with normalized phone when configured', async () => {
      process.env.WHATSAPP_PHONE_NUMBER_ID = '12345'
      process.env.WHATSAPP_BEARER_TOKEN = 'tok'
      process.env.WHATSAPP_API_VERSION = 'v20.0'

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ messages: [{ id: 'wamid.x' }] }),
      })
      vi.stubGlobal('fetch', fetchMock)

      const driver = new WhatsAppDriver()
      const result = await driver.send(
        { type: 'ORDER_RECEIVED', orderNumber: 1001 },
        { phone: '0501234567', name: 'Test' }
      )
      expect(result.success).toBe(true)
      expect(fetchMock).toHaveBeenCalledOnce()

      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe('https://graph.facebook.com/v20.0/12345/messages')
      const body = JSON.parse((init as RequestInit).body as string)
      expect(body.messaging_product).toBe('whatsapp')
      expect(body.to).toBe('972501234567')
      expect(body.type).toBe('text')
      expect(body.text.body).toContain('1001')
    })

    it('returns descriptive error when the API rejects', async () => {
      process.env.WHATSAPP_PHONE_NUMBER_ID = '12345'
      process.env.WHATSAPP_BEARER_TOKEN = 'tok'

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 400,
          json: async () => ({ error: { message: 'Invalid recipient' } }),
        })
      )

      const driver = new WhatsAppDriver()
      const result = await driver.send(
        { type: 'ORDER_RECEIVED', orderNumber: 1 },
        { phone: '0501234567' }
      )
      expect(result.success).toBe(false)
      expect(result.error).toContain('HTTP 400')
      expect(result.error).toContain('Invalid recipient')
    })

    it('handles network failures gracefully', async () => {
      process.env.WHATSAPP_PHONE_NUMBER_ID = '12345'
      process.env.WHATSAPP_BEARER_TOKEN = 'tok'

      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('ECONNRESET'))
      )

      const driver = new WhatsAppDriver()
      const result = await driver.send(
        { type: 'ORDER_RECEIVED', orderNumber: 1 },
        { phone: '0501234567' }
      )
      expect(result.success).toBe(false)
      expect(result.error).toBe('ECONNRESET')
    })
  })
})
