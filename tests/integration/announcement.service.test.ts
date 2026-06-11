import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { PrismaClient, Role } from '@prisma/client'
import { AnnouncementService } from '@/services/announcement.service'
import { NotificationService } from '@/services/notifications'
import { MockDriver } from '@/services/notifications/drivers'

const prisma = new PrismaClient()
const notifications = new MockDriver()

let userId: string
let user2Id: string

async function resetDb() {
  await prisma.notificationLog.deleteMany()
  await prisma.announcementAck.deleteMany()
  await prisma.announcement.deleteMany()
  await prisma.user.deleteMany()
  await prisma.store.deleteMany()
}

async function seed() {
  const store = await prisma.store.create({
    data: { name: 'S', code: 'ANN-01', phone: '0558888881', active: true },
  })
  const u1 = await prisma.user.create({
    data: { name: 'U1', phone: '0558888881', role: Role.FRANCHISEE, storeId: store.id, active: true },
  })
  const u2 = await prisma.user.create({
    data: { name: 'U2', phone: '0558888882', role: Role.FRANCHISEE, storeId: store.id, active: true },
  })
  userId = u1.id
  user2Id = u2.id
}

describe('AnnouncementService', () => {
  beforeEach(async () => {
    await resetDb()
    await seed()
    notifications.clear()
    NotificationService.setDriver(notifications)
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  describe('create', () => {
    it('creates an announcement and broadcasts to all active franchisees', async () => {
      const ann = await AnnouncementService.create({
        title: 'מבצע חורף',
        body: 'הנחה 20% על כל הספלים',
      })
      expect(ann.title).toBe('מבצע חורף')
      expect(ann.requiresAck).toBe(false)
      expect(notifications.sent).toHaveLength(2) // 2 franchisees
      expect(notifications.sent[0].event.type).toBe('ANNOUNCEMENT')
    })

    it('does not notify warehouse/admin users', async () => {
      await prisma.user.create({
        data: { name: 'W', phone: '0558888889', role: Role.WAREHOUSE, active: true },
      })
      notifications.clear()
      await AnnouncementService.create({ title: 't', body: 'b' })
      expect(notifications.sent).toHaveLength(2) // still only the 2 franchisees
    })
  })

  describe('listForUser', () => {
    it('returns active announcements with ack status per user', async () => {
      const a1 = await AnnouncementService.create({ title: 'A', body: 'a' })
      await AnnouncementService.create({ title: 'B', body: 'b' })

      let list = await AnnouncementService.listForUser(userId)
      expect(list).toHaveLength(2)
      expect(list.every((a) => !a.ackedByMe)).toBe(true)

      await AnnouncementService.ack(a1.id, userId)
      list = await AnnouncementService.listForUser(userId)
      const acked = list.find((a) => a.id === a1.id)
      expect(acked?.ackedByMe).toBe(true)

      // Other user still sees it as unacked
      const list2 = await AnnouncementService.listForUser(user2Id)
      expect(list2.find((a) => a.id === a1.id)?.ackedByMe).toBe(false)
    })

    it('excludes expired announcements', async () => {
      await AnnouncementService.create({
        title: 'Expired',
        body: '...',
        expiresAt: new Date(Date.now() - 1000),
      })
      await AnnouncementService.create({
        title: 'Active',
        body: '...',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      })

      const list = await AnnouncementService.listForUser(userId)
      expect(list).toHaveLength(1)
      expect(list[0].title).toBe('Active')
    })

    it('orders newest first', async () => {
      const a1 = await AnnouncementService.create({ title: 'First', body: '.' })
      // Small wait so createdAt differs
      await new Promise((r) => setTimeout(r, 10))
      const a2 = await AnnouncementService.create({ title: 'Second', body: '.' })

      const list = await AnnouncementService.listForUser(userId)
      expect(list[0].id).toBe(a2.id)
      expect(list[1].id).toBe(a1.id)
    })
  })

  describe('ack', () => {
    it('is idempotent', async () => {
      const a = await AnnouncementService.create({ title: 't', body: 'b' })
      await AnnouncementService.ack(a.id, userId)
      await AnnouncementService.ack(a.id, userId)
      const count = await prisma.announcementAck.count({
        where: { announcementId: a.id, userId },
      })
      expect(count).toBe(1)
    })
  })
})
