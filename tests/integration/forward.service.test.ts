import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { PrismaClient, ProductStatus } from '@prisma/client'
import { ForwardService } from '@/services/forward.service'

const prisma = new PrismaClient()

let catId: string
let prodAId: string
let prodBId: string

async function resetDb() {
  await prisma.specialForward.deleteMany()
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
  const cat = await prisma.category.create({ data: { name: 'בלינדרמים', sortOrder: 10 } })
  const a = await prisma.product.create({
    data: { name: 'מסגרת מוארת 15x15', barcode: 'FWD-A', categoryId: cat.id, priceAgorot: 0, status: ProductStatus.ACTIVE },
  })
  const b = await prisma.product.create({
    data: { name: 'שקיות ניילון 20/30', barcode: 'FWD-B', categoryId: cat.id, priceAgorot: 0, status: ProductStatus.ACTIVE },
  })
  catId = cat.id
  prodAId = a.id
  prodBId = b.id
}

describe('ForwardService', () => {
  beforeEach(async () => {
    await resetDb()
    await seed()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('creates a destination with product and category links', async () => {
    const fwd = await ForwardService.create({
      name: 'מחסן מסגרות',
      phone: '0501234567',
      productIds: [prodAId],
      categoryIds: [catId],
    })
    expect(fwd.name).toBe('מחסן מסגרות')
    expect(fwd.active).toBe(true)
    expect(fwd.products.map((p) => p.id)).toEqual([prodAId])
    expect(fwd.categories.map((c) => c.id)).toEqual([catId])
  })

  it('accepts a WhatsApp group chat id as phone', async () => {
    const fwd = await ForwardService.create({ name: 'קבוצה', phone: '12036302@g.us' })
    expect(fwd.phone).toBe('12036302@g.us')
  })

  it('rejects invalid input', async () => {
    await expect(ForwardService.create({ name: '', phone: '0501234567' })).rejects.toThrow('INVALID_NAME')
    await expect(ForwardService.create({ name: 'x', phone: 'abc' })).rejects.toThrow('INVALID_PHONE')
    await expect(
      ForwardService.create({ name: 'x', phone: '0501234567', productIds: ['nope'] })
    ).rejects.toThrow('PRODUCT_NOT_FOUND')
    await expect(
      ForwardService.create({ name: 'x', phone: '0501234567', categoryIds: ['nope'] })
    ).rejects.toThrow('CATEGORY_NOT_FOUND')
  })

  it('update replaces link lists in full and toggles active', async () => {
    const fwd = await ForwardService.create({
      name: 'יעד',
      phone: '0501234567',
      productIds: [prodAId],
    })
    const updated = await ForwardService.update(fwd.id, {
      active: false,
      productIds: [prodBId],
      categoryIds: [catId],
    })
    expect(updated.active).toBe(false)
    expect(updated.products.map((p) => p.id)).toEqual([prodBId])
    expect(updated.categories.map((c) => c.id)).toEqual([catId])

    // Omitting the lists leaves them untouched
    const renamed = await ForwardService.update(fwd.id, { name: 'יעד ב' })
    expect(renamed.name).toBe('יעד ב')
    expect(renamed.products.map((p) => p.id)).toEqual([prodBId])
  })

  it('remove deletes the destination and its links', async () => {
    const fwd = await ForwardService.create({
      name: 'יעד',
      phone: '0501234567',
      productIds: [prodAId, prodBId],
    })
    await ForwardService.remove(fwd.id)
    expect(await ForwardService.list()).toHaveLength(0)
    expect(await prisma.specialForwardProduct.count()).toBe(0)
    await expect(ForwardService.remove(fwd.id)).rejects.toThrow('FORWARD_NOT_FOUND')
  })

  it('deleting a product removes it from destinations (cascade)', async () => {
    const fwd = await ForwardService.create({
      name: 'יעד',
      phone: '0501234567',
      productIds: [prodAId, prodBId],
    })
    await prisma.product.delete({ where: { id: prodBId } })
    const [after] = await ForwardService.list()
    expect(after.id).toBe(fwd.id)
    expect(after.products.map((p) => p.id)).toEqual([prodAId])
  })

  it('listMatchers returns only active destinations with lookup sets', async () => {
    await ForwardService.create({ name: 'פעיל', phone: '0501111111', categoryIds: [catId] })
    const off = await ForwardService.create({ name: 'כבוי', phone: '0502222222' })
    await ForwardService.update(off.id, { active: false })

    const matchers = await ForwardService.listMatchers()
    expect(matchers).toHaveLength(1)
    expect(matchers[0].name).toBe('פעיל')
    expect(matchers[0].categoryNames.has('בלינדרמים')).toBe(true)
  })
})
