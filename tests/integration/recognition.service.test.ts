import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { PrismaClient, ProductStatus } from '@prisma/client'
import { ProductRecognitionService } from '@/services/recognition'
import { MockRecognitionDriver } from '@/services/recognition/mock'

const prisma = new PrismaClient()
const driver = new MockRecognitionDriver()

let p1: string
let p2: string
let pHidden: string

async function resetDb() {
  await prisma.orderItem.deleteMany()
  await prisma.order.deleteMany()
  await prisma.priceChange.deleteMany()
  await prisma.product.deleteMany()
  await prisma.category.deleteMany()
}

async function seed() {
  const cat = await prisma.category.create({ data: { name: 'בדיקה', sortOrder: 10 } })
  const a = await prisma.product.create({
    data: { name: 'בלוק עץ', barcode: 'R-1', categoryId: cat.id, priceAgorot: 4900, status: ProductStatus.ACTIVE },
  })
  const b = await prisma.product.create({
    data: { name: 'קנבס', barcode: 'R-2', categoryId: cat.id, priceAgorot: 9900, status: ProductStatus.ACTIVE },
  })
  const h = await prisma.product.create({
    data: { name: 'נסתר', barcode: 'R-9', categoryId: cat.id, priceAgorot: 1000, status: ProductStatus.HIDDEN },
  })
  p1 = a.id
  p2 = b.id
  pHidden = h.id
}

describe('ProductRecognitionService', () => {
  beforeEach(async () => {
    await resetDb()
    await seed()
    driver.next = null
    ProductRecognitionService.setDriver(driver)
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  const img = { base64: 'AAAA', mimeType: 'image/jpeg' as const }

  it('maps driver matches to full catalog products, ordered by confidence', async () => {
    driver.next = [
      { productId: p2, confidence: 0.4 },
      { productId: p1, confidence: 0.9 },
    ]
    const results = await ProductRecognitionService.recognize(img)
    expect(results.map((r) => r.product.id)).toEqual([p1, p2])
    expect(results[0].confidence).toBe(0.9)
    expect(results[0].product.name).toBe('בלוק עץ')
  })

  it('never returns HIDDEN products even if the driver suggests them', async () => {
    driver.next = [{ productId: pHidden, confidence: 0.99 }]
    const results = await ProductRecognitionService.recognize(img)
    expect(results).toHaveLength(0)
  })

  it('returns [] when the driver finds no match', async () => {
    driver.next = []
    const results = await ProductRecognitionService.recognize(img)
    expect(results).toEqual([])
  })
})
