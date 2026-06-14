import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'

// Mock web-push so no real network calls happen.
const sendNotification = vi.fn()
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: (...args: unknown[]) => sendNotification(...args),
  },
}))

const prisma = new PrismaClient()

async function resetDb() {
  await prisma.pushSubscription.deleteMany()
  await prisma.user.deleteMany()
}

let userId: string

async function seed() {
  const user = await prisma.user.create({
    data: { phone: '0551112222', name: 'זכיין', role: 'FRANCHISEE', active: true },
  })
  userId = user.id
  await prisma.pushSubscription.createMany({
    data: [
      {
        userId,
        endpoint: 'https://push.example.com/a',
        p256dh: 'p256dh-a',
        auth: 'auth-a',
      },
      {
        userId,
        endpoint: 'https://push.example.com/b',
        p256dh: 'p256dh-b',
        auth: 'auth-b',
      },
    ],
  })
}

const VAPID_PUBLIC =
  'BJEpaCC0Yq_3Lllwr0-zjBrTE-QdGM7579_pHQq0DxsReVbfYK65XOwb_T0uOwbQQw_7iqqOk3FXFRuys8QtqS8'
const VAPID_PRIVATE = 'lB0kmIQRFaguu8qO3nUADJn3AVNL9qi9RyxXvk9A96Y'

async function loadConfiguredPushService() {
  process.env.VAPID_PUBLIC_KEY = VAPID_PUBLIC
  process.env.VAPID_PRIVATE_KEY = VAPID_PRIVATE
  process.env.VAPID_SUBJECT = 'mailto:test@held.local'
  vi.resetModules()
  const mod = await import('@/services/notifications/push')
  return mod.PushService
}

const event = { type: 'ORDER_READY', orderNumber: 42 } as const

describe('PushService', () => {
  beforeEach(async () => {
    sendNotification.mockReset()
    await resetDb()
    await seed()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('reports configured and exposes the public key when VAPID is set', async () => {
    const PushService = await loadConfiguredPushService()
    expect(PushService.isConfigured()).toBe(true)
    expect(PushService.publicKey()).toBe(VAPID_PUBLIC)
  })

  it('is a no-op (does not send) when VAPID is not configured', async () => {
    delete process.env.VAPID_PUBLIC_KEY
    delete process.env.VAPID_PRIVATE_KEY
    vi.resetModules()
    const { PushService } = await import('@/services/notifications/push')
    await PushService.sendToPhone('0551112222', event)
    expect(sendNotification).not.toHaveBeenCalled()
  })

  it('sends to every subscription the user has', async () => {
    const PushService = await loadConfiguredPushService()
    sendNotification.mockResolvedValue(undefined)
    await PushService.sendToPhone('0551112222', event)
    expect(sendNotification).toHaveBeenCalledTimes(2)
    const remaining = await prisma.pushSubscription.count({ where: { userId } })
    expect(remaining).toBe(2)
  })

  it('prunes subscriptions that return 410 Gone', async () => {
    const PushService = await loadConfiguredPushService()
    sendNotification.mockRejectedValue({ statusCode: 410 })
    await PushService.sendToPhone('0551112222', event)
    const remaining = await prisma.pushSubscription.count({ where: { userId } })
    expect(remaining).toBe(0)
  })

  it('keeps subscriptions on transient (500) errors', async () => {
    const PushService = await loadConfiguredPushService()
    sendNotification.mockRejectedValue({ statusCode: 500 })
    await PushService.sendToPhone('0551112222', event)
    const remaining = await prisma.pushSubscription.count({ where: { userId } })
    expect(remaining).toBe(2)
  })

  it('does nothing for an unknown phone', async () => {
    const PushService = await loadConfiguredPushService()
    await PushService.sendToPhone('0000000000', event)
    expect(sendNotification).not.toHaveBeenCalled()
  })
})
