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

let catA: { id: string }
let catB: { id: string }

async function seed() {
  catA = await prisma.category.create({ data: { name: 'בלוקים מעץ', sortOrder: 10 } })
  catB = await prisma.category.create({ data: { name: 'קנבסים', sortOrder: 20 } })
  await prisma.product.createMany({
    data: [
      {
        name: 'בלוק עץ',
        barcode: '7290000020001',
        categoryId: catA.id,
        priceAgorot: 4900,
        status: ProductStatus.ACTIVE,
      },
      {
        name: 'מוצר נסתר',
        barcode: '7290000020099',
        categoryId: catB.id,
        priceAgorot: 1000,
        status: ProductStatus.HIDDEN,
      },
    ],
  })
}

describe('CatalogService admin management', () => {
  beforeEach(async () => {
    await resetDb()
    await seed()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  describe('listCategories', () => {
    it('returns all categories ordered by sortOrder', async () => {
      const cats = await CatalogService.listCategories()
      expect(cats.map((c) => c.name)).toEqual(['בלוקים מעץ', 'קנבסים'])
    })
  })

  describe('listForAdmin', () => {
    it('includes HIDDEN products', async () => {
      const products = await CatalogService.listForAdmin()
      expect(products.some((p) => p.status === ProductStatus.HIDDEN)).toBe(true)
      expect(products).toHaveLength(2)
    })

    it('attaches the category name', async () => {
      const products = await CatalogService.listForAdmin({ categoryId: catA.id })
      expect(products).toHaveLength(1)
      expect(products[0].categoryName).toBe('בלוקים מעץ')
    })

    it('filters by status', async () => {
      const products = await CatalogService.listForAdmin({ status: ProductStatus.HIDDEN })
      expect(products).toHaveLength(1)
      expect(products[0].name).toBe('מוצר נסתר')
    })

    it('filters by free-text search on name and barcode', async () => {
      expect(await CatalogService.listForAdmin({ search: 'בלוק' })).toHaveLength(1)
      expect(await CatalogService.listForAdmin({ search: '7290000020099' })).toHaveLength(1)
    })
  })

  describe('createProduct', () => {
    it('creates an ACTIVE product by default', async () => {
      const product = await CatalogService.createProduct({
        name: 'פריט חדש',
        barcode: '7290000020500',
        categoryId: catA.id,
        priceAgorot: 5500,
      })
      expect(product.status).toBe(ProductStatus.ACTIVE)
      expect(product.categoryName).toBe('בלוקים מעץ')
      const inDb = await prisma.product.findUnique({ where: { barcode: '7290000020500' } })
      expect(inDb).not.toBeNull()
    })

    it('throws BARCODE_EXISTS on duplicate barcode', async () => {
      await expect(
        CatalogService.createProduct({
          name: 'כפילות',
          barcode: '7290000020001',
          categoryId: catA.id,
          priceAgorot: 1000,
        })
      ).rejects.toThrow('BARCODE_EXISTS')
    })

    it('throws CATEGORY_NOT_FOUND for unknown category', async () => {
      await expect(
        CatalogService.createProduct({
          name: 'ללא קטגוריה',
          barcode: '7290000020600',
          categoryId: 'nope',
          priceAgorot: 1000,
        })
      ).rejects.toThrow('CATEGORY_NOT_FOUND')
    })
  })

  describe('updateProduct', () => {
    it('updates name, category and status', async () => {
      const existing = await prisma.product.findUnique({ where: { barcode: '7290000020001' } })
      const updated = await CatalogService.updateProduct(existing!.id, {
        name: 'בלוק עץ מעודכן',
        categoryId: catB.id,
        status: ProductStatus.OUT_OF_STOCK,
      })
      expect(updated.name).toBe('בלוק עץ מעודכן')
      expect(updated.categoryName).toBe('קנבסים')
      expect(updated.status).toBe(ProductStatus.OUT_OF_STOCK)
    })

    it('throws PRODUCT_NOT_FOUND for unknown id', async () => {
      await expect(
        CatalogService.updateProduct('nope', { status: ProductStatus.HIDDEN })
      ).rejects.toThrow('PRODUCT_NOT_FOUND')
    })
  })

  describe('setPrice', () => {
    it('updates price and records a PriceChange', async () => {
      const existing = await prisma.product.findUnique({ where: { barcode: '7290000020001' } })
      const updated = await CatalogService.setPrice(existing!.id, 6300, 'admin-user')
      expect(updated.priceAgorot).toBe(6300)
      const history = await prisma.priceChange.findMany({ where: { productId: existing!.id } })
      expect(history).toHaveLength(1)
      expect(history[0].oldAgorot).toBe(4900)
      expect(history[0].newAgorot).toBe(6300)
      expect(history[0].changedBy).toBe('admin-user')
    })

    it('is a no-op when the price is unchanged', async () => {
      const existing = await prisma.product.findUnique({ where: { barcode: '7290000020001' } })
      await CatalogService.setPrice(existing!.id, 4900, 'admin-user')
      const history = await prisma.priceChange.findMany({ where: { productId: existing!.id } })
      expect(history).toHaveLength(0)
    })

    it('throws PRODUCT_NOT_FOUND for unknown id', async () => {
      await expect(CatalogService.setPrice('nope', 5000, 'admin-user')).rejects.toThrow(
        'PRODUCT_NOT_FOUND'
      )
    })
  })

  describe('setImage', () => {
    it('saves an image url on the product', async () => {
      const existing = await prisma.product.findUnique({ where: { barcode: '7290000020001' } })
      const updated = await CatalogService.setImage(existing!.id, 'https://cdn.example/img.jpg')
      expect(updated.imagePath).toBe('https://cdn.example/img.jpg')
      const fresh = await prisma.product.findUnique({ where: { id: existing!.id } })
      expect(fresh!.imagePath).toBe('https://cdn.example/img.jpg')
    })

    it('clears the image when passed null', async () => {
      const existing = await prisma.product.findUnique({ where: { barcode: '7290000020001' } })
      await CatalogService.setImage(existing!.id, 'https://cdn.example/img.jpg')
      const cleared = await CatalogService.setImage(existing!.id, null)
      expect(cleared.imagePath).toBeNull()
    })

    it('throws PRODUCT_NOT_FOUND for unknown id', async () => {
      await expect(CatalogService.setImage('nope', 'https://x/y.jpg')).rejects.toThrow(
        'PRODUCT_NOT_FOUND'
      )
    })
  })
})
