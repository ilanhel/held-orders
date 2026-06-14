import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { PrismaClient, ProductStatus, OrderStatus } from '@prisma/client'
import { CatalogService } from '@/services/catalog.service'
import { OrderService } from '@/services/order.service'

const prisma = new PrismaClient()

async function resetDb() {
  await prisma.orderItem.deleteMany()
  await prisma.orderStatusHistory.deleteMany()
  await prisma.order.deleteMany()
  await prisma.priceChange.deleteMany()
  await prisma.product.deleteMany()
  await prisma.category.deleteMany()
  await prisma.store.deleteMany()
  await prisma.user.deleteMany()
}

let catId: string
let trackedId: string
let untrackedId: string
let storeId: string
let userId: string

async function seed() {
  const cat = await prisma.category.create({ data: { name: 'בלוקים מעץ', sortOrder: 10 } })
  catId = cat.id

  const tracked = await prisma.product.create({
    data: {
      name: 'בלוק עץ',
      barcode: '7290000030001',
      categoryId: catId,
      priceAgorot: 4900,
      status: ProductStatus.ACTIVE,
      stockQty: 5,
      trackStock: true,
    },
  })
  trackedId = tracked.id

  const untracked = await prisma.product.create({
    data: {
      name: 'קנבס',
      barcode: '7290000030002',
      categoryId: catId,
      priceAgorot: 9900,
      status: ProductStatus.ACTIVE,
      stockQty: 0,
      trackStock: false,
    },
  })
  untrackedId = untracked.id

  const store = await prisma.store.create({
    data: { name: 'סניף עזריאלי', code: 'AZR', phone: '0500000000' },
  })
  storeId = store.id

  const user = await prisma.user.create({
    data: { phone: '0559999999', name: 'מנהל מחסן', role: 'WAREHOUSE', active: true },
  })
  userId = user.id
}

describe('CatalogService inventory', () => {
  beforeEach(async () => {
    await resetDb()
    await seed()
  })

  afterAll(async () => {
    await resetDb()
    await prisma.$disconnect()
  })

  describe('setStock', () => {
    it('sets an absolute quantity for a tracked product', async () => {
      const p = await CatalogService.setStock(trackedId, 12)
      expect(p.stockQty).toBe(12)
      expect(p.trackStock).toBe(true)
    })

    it('toggles tracking on for a previously untracked product', async () => {
      const p = await CatalogService.setStock(untrackedId, 3, true)
      expect(p.trackStock).toBe(true)
      expect(p.stockQty).toBe(3)
    })

    it('auto-marks OUT_OF_STOCK when tracked stock hits 0', async () => {
      const p = await CatalogService.setStock(trackedId, 0)
      expect(p.stockQty).toBe(0)
      expect(p.status).toBe(ProductStatus.OUT_OF_STOCK)
    })

    it('restores ACTIVE when tracked stock returns above 0', async () => {
      await CatalogService.setStock(trackedId, 0)
      const p = await CatalogService.setStock(trackedId, 4)
      expect(p.status).toBe(ProductStatus.ACTIVE)
    })

    it('never changes status of a HIDDEN product', async () => {
      await CatalogService.setStatus(trackedId, ProductStatus.HIDDEN)
      const p = await CatalogService.setStock(trackedId, 0)
      expect(p.status).toBe(ProductStatus.HIDDEN)
    })

    it('rejects negative quantities', async () => {
      await expect(CatalogService.setStock(trackedId, -1)).rejects.toThrow('INVALID_QTY')
    })

    it('throws PRODUCT_NOT_FOUND for an unknown id', async () => {
      await expect(CatalogService.setStock('nope', 1)).rejects.toThrow('PRODUCT_NOT_FOUND')
    })
  })

  describe('decrement on shipment', () => {
    async function makeOrder(items: { productId: string; qtyOrdered: number; qtySupplied?: number }[]) {
      const products = await prisma.product.findMany({
        where: { id: { in: items.map((i) => i.productId) } },
      })
      const byId = new Map(products.map((p) => [p.id, p]))
      const order = await prisma.order.create({
        data: {
          storeId,
          createdBy: userId,
          status: OrderStatus.READY,
          items: {
            create: items.map((i) => {
              const prod = byId.get(i.productId)!
              return {
                productId: i.productId,
                qtyOrdered: i.qtyOrdered,
                qtySupplied: i.qtySupplied ?? null,
                priceAgorot: prod.priceAgorot,
                productName: prod.name,
                productBarcode: prod.barcode,
              }
            }),
          },
        },
      })
      return order
    }

    it('decrements tracked stock by qtySupplied when the order ships', async () => {
      const order = await makeOrder([
        { productId: trackedId, qtyOrdered: 5, qtySupplied: 2 },
      ])
      await OrderService.transitionStatus(order.id, OrderStatus.SHIPPED, userId)
      const p = await prisma.product.findUnique({ where: { id: trackedId } })
      expect(p?.stockQty).toBe(3)
    })

    it('falls back to qtyOrdered when qtySupplied is null', async () => {
      const order = await makeOrder([{ productId: trackedId, qtyOrdered: 4 }])
      await OrderService.transitionStatus(order.id, OrderStatus.SHIPPED, userId)
      const p = await prisma.product.findUnique({ where: { id: trackedId } })
      expect(p?.stockQty).toBe(1)
    })

    it('does not go below zero and marks OUT_OF_STOCK', async () => {
      const order = await makeOrder([
        { productId: trackedId, qtyOrdered: 99, qtySupplied: 99 },
      ])
      await OrderService.transitionStatus(order.id, OrderStatus.SHIPPED, userId)
      const p = await prisma.product.findUnique({ where: { id: trackedId } })
      expect(p?.stockQty).toBe(0)
      expect(p?.status).toBe(ProductStatus.OUT_OF_STOCK)
    })

    it('ignores untracked products', async () => {
      const order = await makeOrder([
        { productId: untrackedId, qtyOrdered: 3, qtySupplied: 3 },
      ])
      await OrderService.transitionStatus(order.id, OrderStatus.SHIPPED, userId)
      const p = await prisma.product.findUnique({ where: { id: untrackedId } })
      expect(p?.stockQty).toBe(0)
      expect(p?.status).toBe(ProductStatus.ACTIVE)
    })
  })
})
