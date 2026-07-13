import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { GreenApiDriver } from '@/services/notifications/green-api'

describe('GreenApiDriver', () => {
  describe('toChatId', () => {
    it('converts Israeli 05X format to 9725X@c.us', () => {
      expect(GreenApiDriver.toChatId('0501234567')).toBe('972501234567@c.us')
    })

    it('strips dashes and spaces', () => {
      expect(GreenApiDriver.toChatId('050-123-4567')).toBe('972501234567@c.us')
      expect(GreenApiDriver.toChatId('050 123 4567')).toBe('972501234567@c.us')
    })

    it('passes through already-international 972 numbers', () => {
      expect(GreenApiDriver.toChatId('972501234567')).toBe('972501234567@c.us')
      expect(GreenApiDriver.toChatId('+972501234567')).toBe('972501234567@c.us')
    })

    it('passes through group chat ids untouched', () => {
      expect(GreenApiDriver.toChatId('120363043968066561@g.us')).toBe(
        '120363043968066561@g.us'
      )
      expect(GreenApiDriver.toChatId('972501234567@c.us')).toBe('972501234567@c.us')
    })
  })

  describe('send', () => {
    const originalEnv = process.env

    beforeEach(() => {
      process.env = { ...originalEnv }
      delete process.env.GREEN_API_ID_INSTANCE
      delete process.env.GREEN_API_TOKEN_INSTANCE
      delete process.env.GREEN_API_URL
      vi.restoreAllMocks()
    })

    afterEach(() => {
      process.env = originalEnv
      vi.restoreAllMocks()
    })

    it('returns GREEN_API_NOT_CONFIGURED when env is missing', async () => {
      const driver = new GreenApiDriver()
      const result = await driver.send(
        { type: 'ORDER_RECEIVED', orderNumber: 1001 },
        { phone: '0501234567' }
      )
      expect(result.success).toBe(false)
      expect(result.error).toBe('GREEN_API_NOT_CONFIGURED')
    })

    it('posts to the Green API endpoint with chatId when configured', async () => {
      process.env.GREEN_API_ID_INSTANCE = '1101000001'
      process.env.GREEN_API_TOKEN_INSTANCE = 'tok123'
      process.env.GREEN_API_URL = 'https://1101.api.greenapi.com'

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ idMessage: 'BAE5' }),
      })
      vi.stubGlobal('fetch', fetchMock)

      const driver = new GreenApiDriver()
      const result = await driver.send(
        { type: 'ORDER_RECEIVED', orderNumber: 1001 },
        { phone: '0501234567', name: 'Test' }
      )
      expect(result.success).toBe(true)
      expect(fetchMock).toHaveBeenCalledOnce()

      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe(
        'https://1101.api.greenapi.com/waInstance1101000001/sendMessage/tok123'
      )
      const body = JSON.parse((init as RequestInit).body as string)
      expect(body.chatId).toBe('972501234567@c.us')
      expect(body.message).toContain('1001')
    })

    it('defaults to the shared host when GREEN_API_URL is unset', async () => {
      process.env.GREEN_API_ID_INSTANCE = '1101000001'
      process.env.GREEN_API_TOKEN_INSTANCE = 'tok123'

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ idMessage: 'BAE5' }),
      })
      vi.stubGlobal('fetch', fetchMock)

      const driver = new GreenApiDriver()
      await driver.send({ type: 'ORDER_RECEIVED', orderNumber: 1 }, { phone: '0501234567' })

      const [url] = fetchMock.mock.calls[0]
      expect(url).toBe(
        'https://api.green-api.com/waInstance1101000001/sendMessage/tok123'
      )
    })

    it('returns a descriptive error when the API rejects', async () => {
      process.env.GREEN_API_ID_INSTANCE = '1101000001'
      process.env.GREEN_API_TOKEN_INSTANCE = 'tok123'

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
          json: async () => ({ error: 'Unauthorized' }),
        })
      )

      const driver = new GreenApiDriver()
      const result = await driver.send(
        { type: 'ORDER_RECEIVED', orderNumber: 1 },
        { phone: '0501234567' }
      )
      expect(result.success).toBe(false)
      expect(result.error).toContain('HTTP 401')
      expect(result.error).toContain('Unauthorized')
    })

    it('handles network failures gracefully', async () => {
      process.env.GREEN_API_ID_INSTANCE = '1101000001'
      process.env.GREEN_API_TOKEN_INSTANCE = 'tok123'

      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')))

      const driver = new GreenApiDriver()
      const result = await driver.send(
        { type: 'ORDER_RECEIVED', orderNumber: 1 },
        { phone: '0501234567' }
      )
      expect(result.success).toBe(false)
      expect(result.error).toBe('ECONNRESET')
    })
  })
})
