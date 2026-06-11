import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { PrismaClient, ProductStatus } from '@prisma/client'
import { CatalogService } from '@/services/catalog.service'

const prisma = new PrismaClient()

async function resetDb() {
  await prisma.orderItem.deleteMany()
  await prisma.orderStatusHistory.deleteMany()
  await prisma.order.deleteMany()
  await prisma.priceChange.deleteMany()
  await prisma.product.deleteMany()
  await prisma.category.deleteMany()
}

async function seedCatalog() {
  const catA = await prisma.category.create({
    data: { name: 'בלוקים מעץ', sortOrder: 10 },
  })
  const catB = await prisma.category.create({
    data: { name: 'קנבסים', sortOrder: 20 },
  })
  // Empty category — should not appear in getCatalog
  await prisma.category.create({
    data: { name: 'ריק', sortOrder: 5 },
  })

  await prisma.product.createMany({
    data: [
      {
        name: 'בלוק עץ 20x20',
        barcode: '7290000010001',
        categoryId: catA.id,
        priceAgorot: 4900,
        status: ProductStatus.ACTIVE,
      },
      {
        name: 'בלוק עץ 30x30',
        barcode: '7290000010002',
        categoryId: catA.id,
        priceAgorot: 9900,
        status: ProductStatus.OUT_OF_STOCK,
      },
      {
        name: 'קנבס 40x50',
        barcode: '7290000010003',
        categoryId: catB.id,
        priceAgorot: 12900,
        status: ProductStatus.ACTIVE,
      },
      {
        name: 'מוצר נסתר',
        barcode: '7290000010099',
        categoryId: catB.id,
        priceAgorot: 1000,
        status: ProductStatus.HIDDEN,
      },
    ],
  })
}

describe('CatalogService', () => {
  beforeEach(async () => {
    await resetDb()
    await seedCatalog()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  describe('getCatalog', () => {
    it('returns categories ordered by sortOrder', async () => {
      const catalog = await CatalogService.getCatalog()
      const names = catalog.map((c) => c.name)
      expect(names).toEqual(['בלוקים מעץ', 'קנבסים'])
    })

    it('omits empty categories', async () => {
      const catalog = await CatalogService.getCatalog()
      expect(catalog.find((c) => c.name === 'ריק')).toBeUndefined()
    })

    it('omits HIDDEN products', async () => {
      const catalog = await CatalogService.getCatalog()
      const canvases = catalog.find((c) => c.name === 'קנבסים')!
      expect(canvases.products).toHaveLength(1)
      expect(canvases.products[0].name).toBe('קנבס 40x50')
    })

    it('includes OUT_OF_STOCK products', async () => {
      const catalog = await CatalogService.getCatalog()
      const blocks = catalog.find((c) => c.name === 'בלוקים מעץ')!
      const statuses = blocks.products.map((p) => p.status)
      expect(statuses).toContain(ProductStatus.OUT_OF_STOCK)
    })

    it('sorts products by name within a category', async () => {
      const catalog = await CatalogService.getCatalog()
      const blocks = catalog.find((c) => c.name === 'בלוקים מעץ')!
      const names = blocks.products.map((p) => p.name)
      expect(names).toEqual([...names].sort())
    })
  })

  describe('searchProducts', () => {
    it('returns empty array for empty query', async () => {
      const results = await CatalogService.searchProducts('   ')
      expect(results).toEqual([])
    })

    it('finds products by partial name', async () => {
      const results = await CatalogService.searchProducts('בלוק')
      expect(results.length).toBeGreaterThanOrEqual(2)
      expect(results.every((r) => r.name.includes('בלוק'))).toBe(true)
    })

    it('finds product by exact barcode', async () => {
      const results = await CatalogService.searchProducts('7290000010003')
      expect(results).toHaveLength(1)
      expect(results[0].name).toBe('קנבס 40x50')
    })

    it('excludes HIDDEN products from search', async () => {
      const results = await CatalogService.searchProducts('נסתר')
      expect(results).toHaveLength(0)
    })

    it('returns empty for unknown query', async () => {
      const results = await CatalogService.searchProducts('xyzxyz')
      expect(results).toEqual([])
    })
  })

  describe('getByBarcode', () => {
    it('returns product for known active barcode', async () => {
      const product = await CatalogService.getByBarcode('7290000010001')
      expect(product).not.toBeNull()
      expect(product?.name).toBe('בלוק עץ 20x20')
    })

    it('returns null for HIDDEN product', async () => {
      const product = await CatalogService.getByBarcode('7290000010099')
      expect(product).toBeNull()
    })

    it('returns null for unknown barcode', async () => {
      const product = await CatalogService.getByBarcode('0000000000000')
      expect(product).toBeNull()
    })
  })
})
