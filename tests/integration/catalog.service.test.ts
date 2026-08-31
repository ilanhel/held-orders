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

    it('finds products by size-dimension prefix', async () => {
      const results = await CatalogService.searchProducts('בלוק 20')
      expect(results).toHaveLength(1)
      expect(results[0].name).toBe('בלוק עץ 20x20')
    })

    it('matches size prefix on either dimension', async () => {
      const results = await CatalogService.searchProducts('50')
      expect(results.map((r) => r.name)).toEqual(['קנבס 40x50'])
    })

    it('does not match numbers mid-dimension', async () => {
      // "0" is not a prefix of 20, 30, 40 or 50
      const results = await CatalogService.searchProducts('0')
      expect(results).toEqual([])
    })

    it('normalizes size separators in the query', async () => {
      const results = await CatalogService.searchProducts('40*50')
      expect(results.map((r) => r.name)).toEqual(['קנבס 40x50'])
    })

    it('requires all tokens to match', async () => {
      const results = await CatalogService.searchProducts('קנבס 20')
      expect(results).toEqual([])
    })
  })

  describe('ensureCanvasSize', () => {
    async function seedCanvasCategory() {
      return prisma.category.create({ data: { name: 'בלינדרמים', sortOrder: 30 } })
    }

    it('creates a customSize product with a size-digits barcode', async () => {
      await seedCanvasCategory()
      const p = await CatalogService.ensureCanvasSize(45, 55)
      expect(p.name).toBe('מסגרת קנבס 45x55')
      expect(p.barcode).toBe('4555')
      const row = await prisma.product.findUnique({ where: { id: p.id } })
      expect(row?.customSize).toBe(true)
      expect(row?.status).toBe(ProductStatus.ACTIVE)
      expect(row?.priceAgorot).toBe(0)
    })

    it('reuses an existing product with the same name', async () => {
      const cat = await seedCanvasCategory()
      const existing = await prisma.product.create({
        data: {
          name: 'מסגרת קנבס 40x50',
          barcode: '77',
          categoryId: cat.id,
          priceAgorot: 500,
        },
      })
      const p = await CatalogService.ensureCanvasSize(40, 50)
      expect(p.id).toBe(existing.id)
      expect(p.barcode).toBe('77')
    })

    it('is idempotent for repeated custom sizes', async () => {
      await seedCanvasCategory()
      const a = await CatalogService.ensureCanvasSize(66, 77)
      const b = await CatalogService.ensureCanvasSize(66, 77)
      expect(b.id).toBe(a.id)
    })

    it('falls back to KNV barcode when digits are taken', async () => {
      const cat = await seedCanvasCategory()
      await prisma.product.create({
        data: { name: 'מוצר אחר', barcode: '4555', categoryId: cat.id, priceAgorot: 100 },
      })
      const p = await CatalogService.ensureCanvasSize(45, 55)
      expect(p.barcode).toBe('KNV45x55')
    })

    it('rejects sizes outside 10-300', async () => {
      await seedCanvasCategory()
      await expect(CatalogService.ensureCanvasSize(9, 50)).rejects.toThrow('INVALID_SIZE')
      await expect(CatalogService.ensureCanvasSize(50, 301)).rejects.toThrow('INVALID_SIZE')
      await expect(CatalogService.ensureCanvasSize(50.5 as number, 50)).rejects.toThrow('INVALID_SIZE')
    })

    it('custom products are hidden from catalog and search', async () => {
      await seedCanvasCategory()
      const p = await CatalogService.ensureCanvasSize(48, 58)
      const catalog = await CatalogService.getCatalog()
      const inCatalog = catalog.flatMap((c) => c.products).some((x) => x.id === p.id)
      expect(inCatalog).toBe(false)
      const results = await CatalogService.searchProducts('מסגרת קנבס 48')
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
