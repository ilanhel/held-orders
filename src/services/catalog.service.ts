import { PrismaClient, ProductStatus } from '@prisma/client'

const prisma = new PrismaClient()

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
