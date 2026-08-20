import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { PrismaClient, ProductStatus, Role } from '@prisma/client'
import { OrderService } from '@/services/order.service'
import { CatalogService } from '@/services/catalog.service'
import { NotificationService } from '@/services/notifications'
import { MockDriver } from '@/services/notifications/drivers'

const prisma = new PrismaClient()
const notifications = new MockDriver()

let storeIds: string[] = []
let userIds: string[] = []
let multiProductId: string // 2 alias barcodes: BC-1, BC-2
let tripleProductId: string // 3 alias barcodes: TR-1, TR-2, TR-3
let plainProductId: string // no aliases

async function resetDb() {
  await prisma.notificationLog.deleteMany()
  await prisma.orderStatusHistory.deleteMany()
  await prisma.orderItem.deleteMany()
  await prisma.order.deleteMany()
  await prisma.storeProductBarcode.deleteMany()
  await prisma.productBarcodeAlias.deleteMany()
  await prisma.priceChange.deleteMany()
  await prisma.product.deleteMany()
  await prisma.category.deleteMany()
  await prisma.user.deleteMany()
  await prisma.store.deleteMany()
}

async function seed() {
  storeIds = []
  userIds = []
  for (let i = 1; i <= 4; i++) {
    const store = await prisma.store.create({
      data: { name: `סניף ${i}`, code: `ALIAS-${i}`, phone: `055000000${i}`, active: true },
    })
    const user = await prisma.user.create({
      data: { name: `זכיין ${i}`, phone: `055000000${i}`, role: Role.FRANCHISEE, storeId: store.id, active: true },
    })
    storeIds.push(store.id)
    userIds.push(user.id)
  }
  const cat = await prisma.category.create({ data: { name: 'מסגרות בדיקה', sortOrder: 10 } })
  const multi = await prisma.product.create({
    data: { name: 'מסגרת רב-ברקוד', barcode: 'BC-1', categoryId: cat.id, priceAgorot: 0, status: ProductStatus.ACTIVE },
  })
  await prisma.productBarcodeAlias.createMany({
    data: [
      { productId: multi.id, barcode: 'BC-1' },
      { productId: multi.id, barcode: 'BC-2' },
    ],
  })
  const triple = await prisma.product.create({
    data: { name: 'מסגרת שלושה ברקודים', barcode: 'TR-1', categoryId: cat.id, priceAgorot: 0, status: ProductStatus.ACTIVE },
  })
  await prisma.productBarcodeAlias.createMany({
    data: [
      { productId: triple.id, barcode: 'TR-1' },
      { productId: triple.id, barcode: 'TR-2' },
      { productId: triple.id, barcode: 'TR-3' },
    ],
  })
  const plain = await prisma.product.create({
    data: { name: 'מוצר רגיל', barcode: 'PLAIN-1', categoryId: cat.id, priceAgorot: 500, status: ProductStatus.ACTIVE },
  })
  multiProductId = multi.id
  tripleProductId = triple.id
  plainProductId = plain.id
}

async function submitOrderFor(storeIdx: number, productId: string): Promise<string> {
  const draft = await OrderService.getOrCreateDraft(storeIds[storeIdx], userIds[storeIdx])
  await OrderService.setItemQty(draft.id, productId, 3)
  const submitted = await OrderService.submitDraft(draft.id, userIds[storeIdx])
  const item = submitted.items.find((i) => i.productId === productId)!
  return item.productBarcode
}

describe('Barcode alias assignment', () => {
  beforeEach(async () => {
    await resetDb()
    await seed()
    notifications.clear()
    NotificationService.setDriver(notifications)
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('regular product keeps its own barcode', async () => {
    const barcode = await submitOrderFor(0, plainProductId)
    expect(barcode).toBe('PLAIN-1')
    expect(await prisma.storeProductBarcode.count()).toBe(0)
  })

  it('multi-barcode product gets one of its alias barcodes', async () => {
    const barcode = await submitOrderFor(0, multiProductId)
    expect(['BC-1', 'BC-2']).toContain(barcode)
  })

  it('same store gets the same barcode on repeat orders (sticky)', async () => {
    const first = await submitOrderFor(0, multiProductId)
    const second = await submitOrderFor(0, multiProductId)
    const third = await submitOrderFor(0, multiProductId)
    expect(second).toBe(first)
    expect(third).toBe(first)
    expect(await prisma.storeProductBarcode.count({ where: { productId: multiProductId } })).toBe(1)
  })

  it('splits stores evenly between 2 barcodes (4 stores → 2/2)', async () => {
    const assigned: string[] = []
    for (let i = 0; i < 4; i++) assigned.push(await submitOrderFor(i, multiProductId))
    const count1 = assigned.filter((b) => b === 'BC-1').length
    const count2 = assigned.filter((b) => b === 'BC-2').length
    expect(count1).toBe(2)
    expect(count2).toBe(2)
  })

  it('splits 4 stores over 3 barcodes with max diff of 1', async () => {
    const assigned: string[] = []
    for (let i = 0; i < 4; i++) assigned.push(await submitOrderFor(i, tripleProductId))
    const counts = ['TR-1', 'TR-2', 'TR-3'].map((b) => assigned.filter((x) => x === b).length)
    expect(Math.max(...counts)).toBe(2)
    expect(Math.min(...counts)).toBe(1)
    expect(counts.reduce((a, b) => a + b, 0)).toBe(4)
  })

  it('assignment survives across different products independently', async () => {
    const multiBarcode = await submitOrderFor(0, multiProductId)
    const tripleBarcode = await submitOrderFor(0, tripleProductId)
    expect(['BC-1', 'BC-2']).toContain(multiBarcode)
    expect(['TR-1', 'TR-2', 'TR-3']).toContain(tripleBarcode)
    // repeat: both sticky
    expect(await submitOrderFor(0, multiProductId)).toBe(multiBarcode)
    expect(await submitOrderFor(0, tripleProductId)).toBe(tripleBarcode)
  })

  it('reassigns if stored barcode is no longer an alias', async () => {
    const first = await submitOrderFor(0, multiProductId)
    // Remove the assigned alias (e.g. barcode retired)
    await prisma.productBarcodeAlias.deleteMany({ where: { barcode: first } })
    await prisma.productBarcodeAlias.create({
      data: { productId: multiProductId, barcode: 'BC-NEW' },
    })
    const second = await submitOrderFor(0, multiProductId)
    expect(second).not.toBe(first)
    const remaining = ['BC-1', 'BC-2', 'BC-NEW'].filter((b) => b !== first)
    expect(remaining).toContain(second)
  })

  it('resolveStoreBarcode returns null for single-alias product', async () => {
    await prisma.productBarcodeAlias.create({
      data: { productId: plainProductId, barcode: 'PLAIN-1' },
    })
    expect(await OrderService.resolveStoreBarcode(storeIds[0], plainProductId)).toBeNull()
  })

  describe('hidden barcodes', () => {
    it('hidden alias is never assigned to new stores', async () => {
      await prisma.productBarcodeAlias.updateMany({
        where: { barcode: 'BC-1' },
        data: { active: false },
      })
      for (let i = 0; i < 4; i++) {
        expect(await submitOrderFor(i, multiProductId)).toBe('BC-2')
      }
    })

    it('store stuck on a hidden barcode is reassigned to an active one', async () => {
      const first = await submitOrderFor(0, multiProductId)
      await prisma.productBarcodeAlias.updateMany({
        where: { barcode: first },
        data: { active: false },
      })
      const second = await submitOrderFor(0, multiProductId)
      expect(second).not.toBe(first)
      expect(['BC-1', 'BC-2']).toContain(second)
      // restore → the store keeps the NEW assignment (sticky)
      await prisma.productBarcodeAlias.updateMany({
        where: { barcode: first },
        data: { active: true },
      })
      expect(await submitOrderFor(0, multiProductId)).toBe(second)
    })

    it('all aliases hidden → falls back to primary product barcode', async () => {
      await prisma.productBarcodeAlias.updateMany({
        where: { productId: multiProductId },
        data: { active: false },
      })
      expect(await submitOrderFor(0, multiProductId)).toBe('BC-1')
    })
  })

  describe('CatalogService barcode management', () => {
    it('listBarcodes returns aliases with assignment counts and primary flag', async () => {
      await submitOrderFor(0, multiProductId)
      const rows = await CatalogService.listBarcodes(multiProductId)
      expect(rows).toHaveLength(2)
      const primary = rows.find((r) => r.barcode === 'BC-1')!
      expect(primary.isPrimary).toBe(true)
      expect(rows.reduce((sum, r) => sum + r.assignedStores, 0)).toBe(1)
    })

    it('addBarcode adds a variant; first add registers the primary too', async () => {
      const rows = await CatalogService.addBarcode(plainProductId, 'PLAIN-2')
      expect(rows.map((r) => r.barcode).sort()).toEqual(['PLAIN-1', 'PLAIN-2'])
      expect(rows.find((r) => r.barcode === 'PLAIN-1')!.isPrimary).toBe(true)
    })

    it('addBarcode rejects duplicates across products and aliases', async () => {
      await expect(CatalogService.addBarcode(plainProductId, 'BC-2')).rejects.toThrow(
        'BARCODE_EXISTS'
      )
      await expect(CatalogService.addBarcode(plainProductId, 'PLAIN-1')).rejects.toThrow(
        'BARCODE_EXISTS'
      )
      await expect(CatalogService.addBarcode(plainProductId, '  ')).rejects.toThrow(
        'INVALID_BARCODE'
      )
    })

    it('setBarcodeActive hides and restores; last active barcode is protected', async () => {
      const rows = await CatalogService.listBarcodes(multiProductId)
      const first = rows.find((r) => r.barcode === 'BC-1')!
      const second = rows.find((r) => r.barcode === 'BC-2')!

      const afterHide = await CatalogService.setBarcodeActive(first.id, false)
      expect(afterHide.find((r) => r.id === first.id)!.active).toBe(false)

      await expect(CatalogService.setBarcodeActive(second.id, false)).rejects.toThrow(
        'LAST_ACTIVE_BARCODE'
      )

      const afterRestore = await CatalogService.setBarcodeActive(first.id, true)
      expect(afterRestore.find((r) => r.id === first.id)!.active).toBe(true)
    })
  })
})
