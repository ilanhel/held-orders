import { PrismaClient, ProductStatus } from '@prisma/client'
import { NotificationService } from './notifications'

const prisma = new PrismaClient()

/** A product created within this window does not trigger a price-change alert. */
const NEW_PRODUCT_GRACE_MS = 24 * 60 * 60 * 1000

export interface CatalogProduct {
  id: string
  name: string
  barcode: string
  categoryId: string
  priceAgorot: number
  imagePath: string | null
  status: ProductStatus
}

export interface CatalogCategory {
  id: string
  name: string
  sortOrder: number
  products: CatalogProduct[]
}

/** A product row for the admin management table (includes category name + HIDDEN). */
export interface AdminProduct extends CatalogProduct {
  categoryName: string
  createdAt: Date
}

export interface AdminCategory {
  id: string
  name: string
  sortOrder: number
}

export class CatalogService {
  /**
   * Get all visible categories (with their visible products: ACTIVE + OUT_OF_STOCK).
   * HIDDEN products are excluded entirely from the franchisee view.
   * Empty categories are filtered out.
   */
  static async getCatalog(): Promise<CatalogCategory[]> {
    const categories = await prisma.category.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        products: {
          where: {
            status: { in: [ProductStatus.ACTIVE, ProductStatus.OUT_OF_STOCK] },
          },
          orderBy: { name: 'asc' },
        },
      },
    })

    return categories
      .filter((c) => c.products.length > 0)
      .map((c) => ({
        id: c.id,
        name: c.name,
        sortOrder: c.sortOrder,
        products: c.products.map(this.toCatalogProduct),
      }))
  }

  /**
   * Search products by name (partial, case-insensitive) or exact barcode.
   * Excludes HIDDEN products.
   */
  static async searchProducts(query: string): Promise<CatalogProduct[]> {
    const q = query.trim()
    if (q.length === 0) return []

    const products = await prisma.product.findMany({
      where: {
        AND: [
          { status: { in: [ProductStatus.ACTIVE, ProductStatus.OUT_OF_STOCK] } },
          {
            OR: [
              { name: { contains: q } },
              { barcode: { equals: q } },
            ],
          },
        ],
      },
      orderBy: { name: 'asc' },
      take: 50,
    })

    return products.map(this.toCatalogProduct)
  }

  /**
   * Lookup a single product by exact barcode (e.g. scanner input).
   * Returns null for HIDDEN or unknown barcodes.
   */
  static async getByBarcode(barcode: string): Promise<CatalogProduct | null> {
    const product = await prisma.product.findUnique({
      where: { barcode },
    })

    if (!product || product.status === ProductStatus.HIDDEN) return null
    return this.toCatalogProduct(product)
  }

  // ---------------------------------------------------------------------------
  // Admin catalog management (§7.4) — ADMIN only (enforced at the API layer).
  // ---------------------------------------------------------------------------

  /** All categories (including empty ones) ordered for management dropdowns. */
  static async listCategories(): Promise<AdminCategory[]> {
    const cats = await prisma.category.findMany({ orderBy: { sortOrder: 'asc' } })
    return cats.map((c) => ({ id: c.id, name: c.name, sortOrder: c.sortOrder }))
  }

  /**
   * List products for the admin table. Includes ALL statuses (incl. HIDDEN).
   * Optional filters: free-text (name or barcode), category, status.
   */
  static async listForAdmin(filters?: {
    search?: string
    categoryId?: string
    status?: ProductStatus
  }): Promise<AdminProduct[]> {
    const q = filters?.search?.trim()
    const products = await prisma.product.findMany({
      where: {
        ...(filters?.categoryId ? { categoryId: filters.categoryId } : {}),
        ...(filters?.status ? { status: filters.status } : {}),
        ...(q
          ? { OR: [{ name: { contains: q } }, { barcode: { contains: q } }] }
          : {}),
      },
      include: { category: { select: { name: true, sortOrder: true } } },
      orderBy: [{ category: { sortOrder: 'asc' } }, { name: 'asc' }],
      take: 500,
    })
    return products.map((p) => ({
      ...this.toCatalogProduct(p),
      categoryName: p.category.name,
      createdAt: p.createdAt,
    }))
  }

  /**
   * Create a new product. Throws 'BARCODE_EXISTS' on duplicate barcode,
   * 'CATEGORY_NOT_FOUND' for an unknown category. A new ACTIVE product
   * broadcasts a "new product" notification to all active franchisees.
   */
  static async createProduct(input: {
    name: string
    barcode: string
    categoryId: string
    priceAgorot: number
    status?: ProductStatus
  }): Promise<AdminProduct> {
    const name = input.name.trim()
    const barcode = input.barcode.trim()

    const category = await prisma.category.findUnique({
      where: { id: input.categoryId },
      select: { name: true },
    })
    if (!category) throw new Error('CATEGORY_NOT_FOUND')

    const existing = await prisma.product.findUnique({ where: { barcode } })
    if (existing) throw new Error('BARCODE_EXISTS')

    const product = await prisma.product.create({
      data: {
        name,
        barcode,
        categoryId: input.categoryId,
        priceAgorot: input.priceAgorot,
        status: input.status ?? ProductStatus.ACTIVE,
      },
    })

    if (product.status === ProductStatus.ACTIVE) {
      const recipients = await prisma.user.findMany({
        where: { role: 'FRANCHISEE', active: true },
        select: { phone: true, name: true },
      })
      await NotificationService.broadcast(
        {
          type: 'PRODUCT_NEW',
          name: product.name,
          barcode: product.barcode,
          priceAgorot: product.priceAgorot,
        },
        recipients.map((u) => ({ phone: u.phone, name: u.name }))
      )
    }

    return {
      ...this.toCatalogProduct(product),
      categoryName: category.name,
      createdAt: product.createdAt,
    }
  }

  /**
   * Update a product's name, category and/or status. Throws
   * 'PRODUCT_NOT_FOUND' / 'CATEGORY_NOT_FOUND'. Does not change price
   * (use setPrice, which records history).
   */
  static async updateProduct(
    id: string,
    input: { name?: string; categoryId?: string; status?: ProductStatus }
  ): Promise<AdminProduct> {
    const product = await prisma.product.findUnique({ where: { id } })
    if (!product) throw new Error('PRODUCT_NOT_FOUND')

    if (input.categoryId) {
      const category = await prisma.category.findUnique({
        where: { id: input.categoryId },
        select: { id: true },
      })
      if (!category) throw new Error('CATEGORY_NOT_FOUND')
    }

    const updated = await prisma.product.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
      include: { category: { select: { name: true } } },
    })

    return {
      ...this.toCatalogProduct(updated),
      categoryName: updated.category.name,
      createdAt: updated.createdAt,
    }
  }

  /**
   * Change a product's price. Records a PriceChange row. Notifies active
   * franchisees of the new price UNLESS the product was created within the
   * last 24h (a brand-new product already announced its price). Throws
   * 'PRODUCT_NOT_FOUND'. A no-op (same price) is ignored.
   */
  static async setPrice(
    id: string,
    newAgorot: number,
    changedBy: string
  ): Promise<AdminProduct> {
    const product = await prisma.product.findUnique({
      where: { id },
      include: { category: { select: { name: true } } },
    })
    if (!product) throw new Error('PRODUCT_NOT_FOUND')

    if (newAgorot === product.priceAgorot) {
      return {
        ...this.toCatalogProduct(product),
        categoryName: product.category.name,
        createdAt: product.createdAt,
      }
    }

    const oldAgorot = product.priceAgorot
    const [updated] = await prisma.$transaction([
      prisma.product.update({
        where: { id },
        data: { priceAgorot: newAgorot },
        include: { category: { select: { name: true } } },
      }),
      prisma.priceChange.create({
        data: { productId: id, oldAgorot, newAgorot, changedBy },
      }),
    ])

    const isNew = Date.now() - product.createdAt.getTime() < NEW_PRODUCT_GRACE_MS
    if (!isNew && product.status !== ProductStatus.HIDDEN) {
      const recipients = await prisma.user.findMany({
        where: { role: 'FRANCHISEE', active: true },
        select: { phone: true, name: true },
      })
      await NotificationService.broadcast(
        {
          type: 'PRICE_CHANGED',
          productName: updated.name,
          oldAgorot,
          newAgorot,
        },
        recipients.map((u) => ({ phone: u.phone, name: u.name }))
      )
    }

    return {
      ...this.toCatalogProduct(updated),
      categoryName: updated.category.name,
      createdAt: updated.createdAt,
    }
  }

  /** Quick status change (mark out of stock / back in stock / hide). */
  static async setStatus(id: string, status: ProductStatus): Promise<AdminProduct> {
    return this.updateProduct(id, { status })
  }

  private static toCatalogProduct(p: {
    id: string
    name: string
    barcode: string
    categoryId: string
    priceAgorot: number
    imagePath: string | null
    status: ProductStatus
  }): CatalogProduct {
    return {
      id: p.id,
      name: p.name,
      barcode: p.barcode,
      categoryId: p.categoryId,
      priceAgorot: p.priceAgorot,
      imagePath: p.imagePath,
      status: p.status,
    }
  }
}
