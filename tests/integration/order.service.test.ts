import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { PrismaClient, ProductStatus, Role, OrderStatus } from '@prisma/client'
import { OrderService } from '@/services/order.service'
import { NotificationService } from '@/services/notifications'
import { MockDriver } from '@/services/notifications/drivers'

const prisma = new PrismaClient()
const notifications = new MockDriver()

let storeId: string
let storeBId: string
let userId: string
let warehouseUserId: string
let prodA: { id: string; priceAgorot: number }
let prodB: { id: string; priceAgorot: number }
let prodHidden: { id: string }

async function resetDb() {
  await prisma.notificationLog.deleteMany()
  await prisma.orderStatusHistory.deleteMany()
  await prisma.orderItem.deleteMany()
  await prisma.order.deleteMany()
  await prisma.priceChange.deleteMany()
  await prisma.product.deleteMany()
  await prisma.category.deleteMany()
  await prisma.user.deleteMany()
  await prisma.store.deleteMany()
}

async function seed() {
  const store = await prisma.store.create({
    data: { name: 'HELD Test', code: 'TST-01', phone: '0551111111', active: true },
  })
  const storeB = await prisma.store.create({
    data: { name: 'HELD Test B', code: 'TST-02', phone: '0551111112', active: true },
  })
  const user = await prisma.user.create({
    data: { name: 'Test User', phone: '0551111111', role: Role.FRANCHISEE, storeId: store.id, active: true },
  })
  const warehouseUser = await prisma.user.create({
    data: { name: 'Warehouse User', phone: '0552222222', role: Role.WAREHOUSE, active: true },
  })
  const cat = await prisma.category.create({
    data: { name: 'בדיקה', sortOrder: 10 },
  })
  const pA = await prisma.product.create({
    data: { name: 'מוצר A', barcode: 'TST-A', categoryId: cat.id, priceAgorot: 5000, status: ProductStatus.ACTIVE },
  })
  const pB = await prisma.product.create({
    data: { name: 'מוצר B', barcode: 'TST-B', categoryId: cat.id, priceAgorot: 12000, status: ProductStatus.ACTIVE },
  })
  const pH = await prisma.product.create({
    data: { name: 'מוצר נסתר', barcode: 'TST-H', categoryId: cat.id, priceAgorot: 999, status: ProductStatus.HIDDEN },
  })

  storeId = store.id
  storeBId = storeB.id
  userId = user.id
  warehouseUserId = warehouseUser.id
  prodA = { id: pA.id, priceAgorot: pA.priceAgorot }
  prodB = { id: pB.id, priceAgorot: pB.priceAgorot }
  prodHidden = { id: pH.id }
}

describe('OrderService', () => {
  beforeEach(async () => {
    await resetDb()
    await seed()
    notifications.clear()
    NotificationService.setDriver(notifications)
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  describe('getOrCreateDraft', () => {
    it('creates a draft if none exists', async () => {
      const draft = await OrderService.getOrCreateDraft(storeId, userId)
      expect(draft.status).toBe(OrderStatus.DRAFT)
      expect(draft.number).toBeNull()
      expect(draft.items).toEqual([])
      expect(draft.storeId).toBe(storeId)
    })

    it('returns the existing draft on second call', async () => {
      const first = await OrderService.getOrCreateDraft(storeId, userId)
      const second = await OrderService.getOrCreateDraft(storeId, userId)
      expect(second.id).toBe(first.id)
    })

    it('supports independent drafts per store', async () => {
      const a = await OrderService.getOrCreateDraft(storeId, userId)
      const b = await OrderService.getOrCreateDraft(storeBId, userId)
      expect(a.id).not.toBe(b.id)
    })
  })

  describe('setItemQty', () => {
    it('adds a new item', async () => {
      const draft = await OrderService.getOrCreateDraft(storeId, userId)
      const updated = await OrderService.setItemQty(draft.id, prodA.id, 3)
      expect(updated.items).toHaveLength(1)
      expect(updated.items[0].qtyOrdered).toBe(3)
      expect(updated.items[0].priceAgorot).toBe(prodA.priceAgorot)
    })

    it('updates an existing item', async () => {
      const draft = await OrderService.getOrCreateDraft(storeId, userId)
      await OrderService.setItemQty(draft.id, prodA.id, 2)
      const updated = await OrderService.setItemQty(draft.id, prodA.id, 5)
      expect(updated.items).toHaveLength(1)
      expect(updated.items[0].qtyOrdered).toBe(5)
    })

    it('removes item when qty is 0', async () => {
      const draft = await OrderService.getOrCreateDraft(storeId, userId)
      await OrderService.setItemQty(draft.id, prodA.id, 2)
      const updated = await OrderService.setItemQty(draft.id, prodA.id, 0)
      expect(updated.items).toHaveLength(0)
    })

    it('rejects negative qty', async () => {
      const draft = await OrderService.getOrCreateDraft(storeId, userId)
      await expect(
        OrderService.setItemQty(draft.id, prodA.id, -1)
      ).rejects.toThrow('INVALID_QTY')
    })

    it('rejects HIDDEN product', async () => {
      const draft = await OrderService.getOrCreateDraft(storeId, userId)
      await expect(
        OrderService.setItemQty(draft.id, prodHidden.id, 1)
      ).rejects.toThrow('PRODUCT_HIDDEN')
    })

    it('calculates totalAgorot', async () => {
      const draft = await OrderService.getOrCreateDraft(storeId, userId)
      await OrderService.setItemQty(draft.id, prodA.id, 2) // 5000 * 2 = 10000
      const updated = await OrderService.setItemQty(draft.id, prodB.id, 3) // 12000 * 3 = 36000
      expect(updated.totalAgorot).toBe(10000 + 36000)
    })
  })

  describe('submitDraft', () => {
    it('rejects empty draft', async () => {
      const draft = await OrderService.getOrCreateDraft(storeId, userId)
      await expect(OrderService.submitDraft(draft.id, userId)).rejects.toThrow(
        'ORDER_EMPTY'
      )
    })

    it('transitions DRAFT to SUBMITTED with assigned number', async () => {
      const draft = await OrderService.getOrCreateDraft(storeId, userId)
      await OrderService.setItemQty(draft.id, prodA.id, 2)

      const submitted = await OrderService.submitDraft(draft.id, userId)
      expect(submitted.status).toBe(OrderStatus.SUBMITTED)
      expect(submitted.number).toBeGreaterThan(1000)
      expect(submitted.submittedAt).not.toBeNull()
    })

    it('rejects re-submitting a non-DRAFT order', async () => {
      const draft = await OrderService.getOrCreateDraft(storeId, userId)
      await OrderService.setItemQty(draft.id, prodA.id, 1)
      await OrderService.submitDraft(draft.id, userId)

      await expect(OrderService.submitDraft(draft.id, userId)).rejects.toThrow(
        'ORDER_NOT_DRAFT'
      )
    })

    it('locks prices at submission time (snapshot)', async () => {
      const draft = await OrderService.getOrCreateDraft(storeId, userId)
      await OrderService.setItemQty(draft.id, prodA.id, 2)

      // Change product price BEFORE submit
      await prisma.product.update({
        where: { id: prodA.id },
        data: { priceAgorot: 9999 },
      })

      const submitted = await OrderService.submitDraft(draft.id, userId)
      expect(submitted.items[0].priceAgorot).toBe(9999) // new price locked

      // Change AFTER submit — should not affect order
      await prisma.product.update({
        where: { id: prodA.id },
        data: { priceAgorot: 1 },
      })
      const reloaded = await prisma.orderItem.findFirst({
        where: { orderId: draft.id },
      })
      expect(reloaded?.priceAgorot).toBe(9999)
    })

    it('records OrderStatusHistory entry', async () => {
      const draft = await OrderService.getOrCreateDraft(storeId, userId)
      await OrderService.setItemQty(draft.id, prodA.id, 1)
      await OrderService.submitDraft(draft.id, userId)

      const history = await prisma.orderStatusHistory.findMany({
        where: { orderId: draft.id },
      })
      expect(history).toHaveLength(1)
      expect(history[0].from).toBe(OrderStatus.DRAFT)
      expect(history[0].to).toBe(OrderStatus.SUBMITTED)
      expect(history[0].byUserId).toBe(userId)
    })

    it('assigns sequential numbers', async () => {
      const d1 = await OrderService.getOrCreateDraft(storeId, userId)
      await OrderService.setItemQty(d1.id, prodA.id, 1)
      const s1 = await OrderService.submitDraft(d1.id, userId)

      const d2 = await OrderService.getOrCreateDraft(storeBId, userId)
      await OrderService.setItemQty(d2.id, prodA.id, 1)
      const s2 = await OrderService.submitDraft(d2.id, userId)

      expect(s2.number).toBe(s1.number! + 1)
    })

    it('a new draft can be started after submission', async () => {
      const d1 = await OrderService.getOrCreateDraft(storeId, userId)
      await OrderService.setItemQty(d1.id, prodA.id, 1)
      await OrderService.submitDraft(d1.id, userId)

      const d2 = await OrderService.getOrCreateDraft(storeId, userId)
      expect(d2.id).not.toBe(d1.id)
      expect(d2.status).toBe(OrderStatus.DRAFT)
    })
  })

  describe('getStoreOrders', () => {
    it('returns submitted orders only (no draft)', async () => {
      const d = await OrderService.getOrCreateDraft(storeId, userId)
      await OrderService.setItemQty(d.id, prodA.id, 1)
      await OrderService.submitDraft(d.id, userId)

      // Also have an active draft
      await OrderService.getOrCreateDraft(storeId, userId)

      const orders = await OrderService.getStoreOrders(storeId)
      expect(orders).toHaveLength(1)
      expect(orders[0].status).toBe(OrderStatus.SUBMITTED)
    })
  })

  describe('submitDraft notification', () => {
    it('notifies warehouse staff on submit', async () => {
      const d = await OrderService.getOrCreateDraft(storeId, userId)
      await OrderService.setItemQty(d.id, prodA.id, 2)
      await OrderService.submitDraft(d.id, userId)

      expect(notifications.sent).toHaveLength(1)
      expect(notifications.sent[0].event.type).toBe('ORDER_SUBMITTED')
      expect(notifications.sent[0].recipient.phone).toBe('0552222222')
    })
  })

  describe('getWarehouseQueue', () => {
    it('returns active orders oldest-first, excludes DRAFT/SHIPPED/CANCELLED', async () => {
      // Submitted order
      const d1 = await OrderService.getOrCreateDraft(storeId, userId)
      await OrderService.setItemQty(d1.id, prodA.id, 1)
      const s1 = await OrderService.submitDraft(d1.id, userId)
      // Shipped order (via full chain)
      const d2 = await OrderService.getOrCreateDraft(storeBId, userId)
      await OrderService.setItemQty(d2.id, prodA.id, 1)
      const s2 = await OrderService.submitDraft(d2.id, userId)
      await OrderService.transitionStatus(s2.id, OrderStatus.RECEIVED, warehouseUserId)
      await OrderService.transitionStatus(s2.id, OrderStatus.PICKING, warehouseUserId)
      await OrderService.transitionStatus(s2.id, OrderStatus.READY, warehouseUserId)
      await OrderService.transitionStatus(s2.id, OrderStatus.SHIPPED, warehouseUserId)
      // Draft (should be excluded)
      await OrderService.getOrCreateDraft(storeId, userId)

      const queue = await OrderService.getWarehouseQueue()
      expect(queue).toHaveLength(1)
      expect(queue[0].id).toBe(s1.id)
    })
  })

  describe('transitionStatus', () => {
    it('allows SUBMITTED → RECEIVED', async () => {
      const d = await OrderService.getOrCreateDraft(storeId, userId)
      await OrderService.setItemQty(d.id, prodA.id, 1)
      const s = await OrderService.submitDraft(d.id, userId)
      notifications.clear()

      const updated = await OrderService.transitionStatus(
        s.id,
        OrderStatus.RECEIVED,
        warehouseUserId
      )
      expect(updated.status).toBe(OrderStatus.RECEIVED)
      expect(notifications.sent[0].event.type).toBe('ORDER_RECEIVED')
      expect(notifications.sent[0].recipient.phone).toBe('0551111111') // franchisee
    })

    it('rejects illegal transition (SUBMITTED → SHIPPED)', async () => {
      const d = await OrderService.getOrCreateDraft(storeId, userId)
      await OrderService.setItemQty(d.id, prodA.id, 1)
      const s = await OrderService.submitDraft(d.id, userId)

      await expect(
        OrderService.transitionStatus(s.id, OrderStatus.SHIPPED, warehouseUserId)
      ).rejects.toThrow('INVALID_TRANSITION')
    })

    it('rejects any transition from SHIPPED (terminal)', async () => {
      const d = await OrderService.getOrCreateDraft(storeId, userId)
      await OrderService.setItemQty(d.id, prodA.id, 1)
      const s = await OrderService.submitDraft(d.id, userId)
      await OrderService.transitionStatus(s.id, OrderStatus.RECEIVED, warehouseUserId)
      await OrderService.transitionStatus(s.id, OrderStatus.PICKING, warehouseUserId)
      await OrderService.transitionStatus(s.id, OrderStatus.READY, warehouseUserId)
      await OrderService.transitionStatus(s.id, OrderStatus.SHIPPED, warehouseUserId)

      await expect(
        OrderService.transitionStatus(s.id, OrderStatus.CANCELLED, warehouseUserId)
      ).rejects.toThrow('INVALID_TRANSITION')
    })

    it('allows CANCELLED from any non-terminal state', async () => {
      const d = await OrderService.getOrCreateDraft(storeId, userId)
      await OrderService.setItemQty(d.id, prodA.id, 1)
      const s = await OrderService.submitDraft(d.id, userId)

      const cancelled = await OrderService.transitionStatus(
        s.id,
        OrderStatus.CANCELLED,
        warehouseUserId
      )
      expect(cancelled.status).toBe(OrderStatus.CANCELLED)
    })

    it('records history for every transition', async () => {
      const d = await OrderService.getOrCreateDraft(storeId, userId)
      await OrderService.setItemQty(d.id, prodA.id, 1)
      const s = await OrderService.submitDraft(d.id, userId)
      await OrderService.transitionStatus(s.id, OrderStatus.RECEIVED, warehouseUserId)

      const history = await prisma.orderStatusHistory.findMany({
        where: { orderId: s.id },
        orderBy: { createdAt: 'asc' },
      })
      expect(history).toHaveLength(2)
      expect(history[0].to).toBe(OrderStatus.SUBMITTED)
      expect(history[1].to).toBe(OrderStatus.RECEIVED)
    })
  })

  describe('updateItemSupply', () => {
    it('updates qtySupplied and picked', async () => {
      const d = await OrderService.getOrCreateDraft(storeId, userId)
      await OrderService.setItemQty(d.id, prodA.id, 5)
      const s = await OrderService.submitDraft(d.id, userId)
      await OrderService.transitionStatus(s.id, OrderStatus.RECEIVED, warehouseUserId)

      const itemId = s.items[0].id
      const updated = await OrderService.updateItemSupply(s.id, itemId, 3, true)
      expect(updated.items[0].qtySupplied).toBe(3)
      expect(updated.items[0].picked).toBe(true)
    })

    it('rejects qtySupplied > qtyOrdered', async () => {
      const d = await OrderService.getOrCreateDraft(storeId, userId)
      await OrderService.setItemQty(d.id, prodA.id, 2)
      const s = await OrderService.submitDraft(d.id, userId)
      await OrderService.transitionStatus(s.id, OrderStatus.RECEIVED, warehouseUserId)

      await expect(
        OrderService.updateItemSupply(s.id, s.items[0].id, 5, true)
      ).rejects.toThrow('INVALID_QTY')
    })

    it('rejects update when order is SUBMITTED (not yet RECEIVED)', async () => {
      const d = await OrderService.getOrCreateDraft(storeId, userId)
      await OrderService.setItemQty(d.id, prodA.id, 2)
      const s = await OrderService.submitDraft(d.id, userId)

      await expect(
        OrderService.updateItemSupply(s.id, s.items[0].id, 1, true)
      ).rejects.toThrow('ORDER_NOT_PICKABLE')
    })
  })

  describe('notifyShortages', () => {
    it('sends shortage notification with diff', async () => {
      const d = await OrderService.getOrCreateDraft(storeId, userId)
      await OrderService.setItemQty(d.id, prodA.id, 5)
      await OrderService.setItemQty(d.id, prodB.id, 3)
      const s = await OrderService.submitDraft(d.id, userId)
      await OrderService.transitionStatus(s.id, OrderStatus.RECEIVED, warehouseUserId)
      await OrderService.updateItemSupply(s.id, s.items[0].id, 5, true) // full
      await OrderService.updateItemSupply(s.id, s.items[1].id, 1, true) // short
      notifications.clear()

      const result = await OrderService.notifyShortages(s.id)
      expect(result.shortageCount).toBe(1)
      expect(notifications.sent).toHaveLength(1)
      expect(notifications.sent[0].event.type).toBe('ORDER_SHORTAGES')
    })

    it('returns 0 if no shortages', async () => {
      const d = await OrderService.getOrCreateDraft(storeId, userId)
      await OrderService.setItemQty(d.id, prodA.id, 2)
      const s = await OrderService.submitDraft(d.id, userId)
      await OrderService.transitionStatus(s.id, OrderStatus.RECEIVED, warehouseUserId)
      await OrderService.updateItemSupply(s.id, s.items[0].id, 2, true)
      notifications.clear()

      const result = await OrderService.notifyShortages(s.id)
      expect(result.shortageCount).toBe(0)
      expect(notifications.sent).toHaveLength(0)
    })
  })
})
