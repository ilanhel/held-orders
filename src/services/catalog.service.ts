import { PrismaClient, ProductStatus } from '@prisma/client'
import { NotificationService } from './notifications'

const prisma = new PrismaClient()

export interface CatalogProduct {
  id: string
  name: string
  barcode: string
  categoryId: string
  priceAgorot: number
  imagePath: string | null
  orderNote: string | null
  groupName: string | null
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
  stockQty: number
  trackStock: boolean
}

export interface AdminCategory {
  id: string
  name: string
  sortOrder: number
  productCount: number
}

/** A barcode variant of a multi-barcode product, for the admin barcode panel. */
export interface ProductBarcodeView {
  id: string
  barcode: string
  active: boolean
  isPrimary: boolean
  assignedStores: number
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
            customSize: false,
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

  /** Normalize size notation: "10X15" / "10*15" / "10/15" / "10 X 15" → "10x15". */
  private static normalizeSizes(text: string): string {
    return text.replace(/(\d+(?:\.\d+)?)\s*[xX×*/]\s*(\d+(?:\.\d+)?)/g, '$1x$2')
  }

  /**
   * Search products by name or exact barcode. Excludes HIDDEN products.
   * The query is split into tokens; ALL tokens must match (AND):
   * - text tokens match as substring (case-insensitive),
   * - pure-number tokens match a size-dimension prefix, so "10" finds
   *   "10x15" as well as "15x10" (but not barcodes or "ל10 תמונות"),
   * - size separators are normalized on both sides ("10*15" finds "10x15").
   */
  static async searchProducts(query: string): Promise<CatalogProduct[]> {
    const q = query.trim()
    if (q.length === 0) return []

    const tokens = this.normalizeSizes(q).toLowerCase().split(/\s+/).filter(Boolean)

    const products = await prisma.product.findMany({
      where: {
        status: { in: [ProductStatus.ACTIVE, ProductStatus.OUT_OF_STOCK] },
        customSize: false,
      },
      orderBy: { name: 'asc' },
    })

    const matches = products.filter((p) => {
      if (p.barcode === q) return true
      const name = this.normalizeSizes(p.name).toLowerCase()
      const words = name.split(/\s+/)
      return tokens.every((t) => {
        if (/^\d+(?:\.\d+)?$/.test(t)) {
          // size-dimension prefix: "10" → 10x15, 15x10, 100x70
          return words.some((w) => w.split('x').some((part) => part.startsWith(t)))
        }
        return name.includes(t)
      })
    })

    return matches.slice(0, 50).map((p) => this.toCatalogProduct(p))
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

  /**
   * Lookup a single product by id. Returns null for HIDDEN or unknown ids.
   */
  static async getById(id: string): Promise<CatalogProduct | null> {
    const product = await prisma.product.findUnique({ where: { id } })
    if (!product || product.status === ProductStatus.HIDDEN) return null
    return this.toCatalogProduct(product)
  }

  /**
   * Find or create a one-off canvas-frame product for a custom size typed by a
   * franchisee (SPEC: any size 10-300cm). Reuses an existing product with the
   * same canonical name (including regular catalog sizes); otherwise creates an
   * ACTIVE product flagged customSize (never shown in catalog/search).
   * Invented barcode: "<w><h>" digits, or "KNV<w>x<h>" if taken.
   * Throws INVALID_SIZE | CANVAS_CATEGORY_NOT_FOUND.
   */
  static async ensureCanvasSize(width: number, height: number): Promise<CatalogProduct> {
    const valid = (n: number) => Number.isInteger(n) && n >= 10 && n <= 300
    if (!valid(width) || !valid(height)) throw new Error('INVALID_SIZE')

    const name = `מסגרת קנבס ${width}x${height}`
    const existing = await prisma.product.findFirst({ where: { name } })
    if (existing) return this.toCatalogProduct(existing)

    const category = await prisma.category.findFirst({ where: { name: 'בלינדרמים' } })
    if (!category) throw new Error('CANVAS_CATEGORY_NOT_FOUND')

    let barcode = `${width}${height}`
    const taken =
      (await prisma.product.findUnique({ where: { barcode } })) ||
      (await prisma.productBarcodeAlias.findUnique({ where: { barcode } }))
    if (taken) barcode = `KNV${width}x${height}`

    try {
      const product = await prisma.product.create({
        data: {
          name,
          barcode,
          categoryId: category.id,
          priceAgorot: 0,
          status: ProductStatus.ACTIVE,
          customSize: true,
        },
      })
      return this.toCatalogProduct(product)
    } catch (err) {
      // Unique-barcode race (two stores adding the same size at once) — adopt
      // the winner.
      const winner = await prisma.product.findFirst({ where: { name } })
      if (winner) return this.toCatalogProduct(winner)
      throw err
    }
  }

  // ---------------------------------------------------------------------------
  // Admin catalog management (§7.4) — ADMIN only (enforced at the API layer).
  // ---------------------------------------------------------------------------

  /** All categories (including empty ones) ordered for management dropdowns. */
  static async listCategories(): Promise<AdminCategory[]> {
    const cats = await prisma.category.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { products: true } } },
    })
    return cats.map((c) => ({
      id: c.id,
      name: c.name,
      sortOrder: c.sortOrder,
      productCount: c._count.products,
    }))
  }

  /**
   * Create a category. Throws 'CATEGORY_NAME_EXISTS' on a duplicate name or
   * 'INVALID_NAME' for an empty name. When sortOrder is omitted the category
   * is placed at the end.
   */
  static async createCategory(input: {
    name: string
    sortOrder?: number
  }): Promise<AdminCategory> {
    const name = input.name.trim()
    if (!name) throw new Error('INVALID_NAME')

    const existing = await prisma.category.findUnique({ where: { name } })
    if (existing) throw new Error('CATEGORY_NAME_EXISTS')

    let sortOrder = input.sortOrder
    if (sortOrder === undefined || !Number.isInteger(sortOrder)) {
      const last = await prisma.category.findFirst({ orderBy: { sortOrder: 'desc' } })
      sortOrder = (last?.sortOrder ?? 0) + 10
    }

    const created = await prisma.category.create({ data: { name, sortOrder } })
    return { id: created.id, name: created.name, sortOrder: created.sortOrder, productCount: 0 }
  }

  /**
   * Update a category's name and/or sort order. Throws 'CATEGORY_NOT_FOUND',
   * 'CATEGORY_NAME_EXISTS' (name taken by another category), or 'INVALID_NAME'.
   */
  static async updateCategory(
    id: string,
    input: { name?: string; sortOrder?: number }
  ): Promise<AdminCategory> {
    const category = await prisma.category.findUnique({ where: { id } })
    if (!category) throw new Error('CATEGORY_NOT_FOUND')

    let name: string | undefined
    if (input.name !== undefined) {
      name = input.name.trim()
      if (!name) throw new Error('INVALID_NAME')
      if (name !== category.name) {
        const clash = await prisma.category.findUnique({ where: { name } })
        if (clash) throw new Error('CATEGORY_NAME_EXISTS')
      }
    }

    const updated = await prisma.category.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(input.sortOrder !== undefined && Number.isInteger(input.sortOrder)
          ? { sortOrder: input.sortOrder }
          : {}),
      },
      include: { _count: { select: { products: true } } },
    })
    return {
      id: updated.id,
      name: updated.name,
      sortOrder: updated.sortOrder,
      productCount: updated._count.products,
    }
  }

  /**
   * Delete a category. Allowed only when it has NO products (products use
   * onDelete: Restrict) — otherwise throws 'CATEGORY_HAS_PRODUCTS'. Throws
   * 'CATEGORY_NOT_FOUND' if the category does not exist.
   */
  static async removeCategory(id: string): Promise<void> {
    const category = await prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    })
    if (!category) throw new Error('CATEGORY_NOT_FOUND')
    if (category._count.products > 0) throw new Error('CATEGORY_HAS_PRODUCTS')

    await prisma.category.delete({ where: { id } })
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
      take: 5000,
    })
    return products.map((p) => ({
      ...this.toCatalogProduct(p),
      categoryName: p.category.name,
      createdAt: p.createdAt,
      stockQty: p.stockQty,
      trackStock: p.trackStock,
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
      stockQty: product.stockQty,
      trackStock: product.trackStock,
    }
  }

  /**
   * Update a product's name, barcode, category and/or status. Throws
   * 'PRODUCT_NOT_FOUND' / 'CATEGORY_NOT_FOUND' / 'BARCODE_EXISTS'. Does not
   * change price (use setPrice, which records history).
   */
  static async updateProduct(
    id: string,
    input: {
      name?: string
      barcode?: string
      categoryId?: string
      status?: ProductStatus
      orderNote?: string | null
      groupName?: string | null
    }
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

    let barcode: string | undefined
    if (input.barcode !== undefined) {
      barcode = input.barcode.trim()
      if (!barcode) throw new Error('INVALID_BARCODE')
      if (barcode !== product.barcode) {
        const taken = await prisma.product.findUnique({
          where: { barcode },
          select: { id: true },
        })
        if (taken) throw new Error('BARCODE_EXISTS')
      }
    }

    const updated = await prisma.product.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(barcode !== undefined ? { barcode } : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.orderNote !== undefined
          ? { orderNote: input.orderNote?.trim() || null }
          : {}),
        ...(input.groupName !== undefined
          ? { groupName: input.groupName?.trim() || null }
          : {}),
      },
      include: { category: { select: { name: true } } },
    })

    return {
      ...this.toCatalogProduct(updated),
      categoryName: updated.category.name,
      createdAt: updated.createdAt,
      stockQty: updated.stockQty,
      trackStock: updated.trackStock,
    }
  }

  /**
   * Change a product's price. Records a PriceChange row for admin/warehouse
   * history. Franchisees are not notified (prices are hidden from them).
   * Throws 'PRODUCT_NOT_FOUND'. A no-op (same price) is ignored.
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
        stockQty: product.stockQty,
        trackStock: product.trackStock,
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

    return {
      ...this.toCatalogProduct(updated),
      categoryName: updated.category.name,
      createdAt: updated.createdAt,
      stockQty: updated.stockQty,
      trackStock: updated.trackStock,
    }
  }

  /** Quick status change (mark out of stock / back in stock / hide). */
  static async setStatus(id: string, status: ProductStatus): Promise<AdminProduct> {
    return this.updateProduct(id, { status })
  }

  /**
   * Set (or clear) a product's image path/URL. Throws 'PRODUCT_NOT_FOUND'.
   * Pass null to remove the image. Does not send notifications.
   */
  static async setImage(
    id: string,
    imagePath: string | null
  ): Promise<AdminProduct> {
    const exists = await prisma.product.findUnique({
      where: { id },
      select: { id: true },
    })
    if (!exists) throw new Error('PRODUCT_NOT_FOUND')

    const updated = await prisma.product.update({
      where: { id },
      data: { imagePath },
      include: { category: { select: { name: true } } },
    })

    return {
      ...this.toCatalogProduct(updated),
      categoryName: updated.category.name,
      createdAt: updated.createdAt,
      stockQty: updated.stockQty,
      trackStock: updated.trackStock,
    }
  }

  /**
   * Set the tracked stock quantity (and optionally toggle tracking) for a
   * product. Throws 'PRODUCT_NOT_FOUND'. When tracking is on and stock reaches
   * 0 the product is auto-marked OUT_OF_STOCK; when stock returns above 0 an
   * OUT_OF_STOCK product is restored to ACTIVE (HIDDEN is never touched).
   */
  static async setStock(
    id: string,
    stockQty: number,
    trackStock?: boolean
  ): Promise<AdminProduct> {
    if (!Number.isInteger(stockQty) || stockQty < 0) throw new Error('INVALID_QTY')
    const product = await prisma.product.findUnique({ where: { id } })
    if (!product) throw new Error('PRODUCT_NOT_FOUND')

    const tracking = trackStock ?? product.trackStock
    let status = product.status
    if (tracking && product.status !== ProductStatus.HIDDEN) {
      if (stockQty === 0) status = ProductStatus.OUT_OF_STOCK
      else if (product.status === ProductStatus.OUT_OF_STOCK) status = ProductStatus.ACTIVE
    }

    const updated = await prisma.product.update({
      where: { id },
      data: { stockQty, trackStock: tracking, status },
      include: { category: { select: { name: true } } },
    })

    return {
      ...this.toCatalogProduct(updated),
      categoryName: updated.category.name,
      createdAt: updated.createdAt,
      stockQty: updated.stockQty,
      trackStock: updated.trackStock,
    }
  }

  /**
   * Decrement tracked stock when an order ships. Only products with
   * trackStock=true are affected; stock never goes below 0. Products that hit
   * 0 are auto-marked OUT_OF_STOCK (unless HIDDEN). Runs inside the caller's
   * flow after a SHIPPED transition.
   */
  static async decrementStockForShipment(
    items: { productId: string; qty: number }[]
  ): Promise<void> {
    for (const { productId, qty } of items) {
      if (qty <= 0) continue
      const product = await prisma.product.findUnique({ where: { id: productId } })
      if (!product || !product.trackStock) continue
      const newQty = Math.max(0, product.stockQty - qty)
      const status =
        newQty === 0 && product.status === ProductStatus.ACTIVE
          ? ProductStatus.OUT_OF_STOCK
          : product.status
      await prisma.product.update({
        where: { id: productId },
        data: { stockQty: newQty, status },
      })
    }
  }

  /**
   * Permanently delete a product. Allowed only when it has never appeared in
   * an order (orders/order items are never destroyed) — otherwise throws
   * 'PRODUCT_IN_ORDERS', and the caller should HIDE the product instead. Price
   * history is removed with the product (onDelete: Cascade). Throws
   * 'PRODUCT_NOT_FOUND' if the product does not exist.
   */
  static async removeProduct(id: string): Promise<void> {
    const product = await prisma.product.findUnique({
      where: { id },
      include: { _count: { select: { orderItems: true } } },
    })
    if (!product) throw new Error('PRODUCT_NOT_FOUND')
    if (product._count.orderItems > 0) throw new Error('PRODUCT_IN_ORDERS')

    await prisma.product.delete({ where: { id } })
  }

  /**
   * List all barcode variants of a product (ProductBarcodeAlias rows),
   * including how many stores are currently assigned to each barcode.
   */
  static async listBarcodes(productId: string): Promise<ProductBarcodeView[]> {
    const product = await prisma.product.findUnique({ where: { id: productId } })
    if (!product) throw new Error('PRODUCT_NOT_FOUND')

    const aliases = await prisma.productBarcodeAlias.findMany({
      where: { productId },
      orderBy: { createdAt: 'asc' },
    })
    const counts = await prisma.storeProductBarcode.groupBy({
      by: ['barcode'],
      where: { productId },
      _count: { _all: true },
    })
    const countMap = new Map(counts.map((c) => [c.barcode, c._count._all]))
    return aliases.map((a) => ({
      id: a.id,
      barcode: a.barcode,
      active: a.active,
      isPrimary: a.barcode === product.barcode,
      assignedStores: countMap.get(a.barcode) ?? 0,
    }))
  }

  /**
   * Add a new barcode variant to a product. If this is the product's first
   * alias, the primary barcode is registered as an alias too so distribution
   * covers all variants. Throws 'PRODUCT_NOT_FOUND' / 'BARCODE_EXISTS'.
   */
  static async addBarcode(productId: string, barcode: string): Promise<ProductBarcodeView[]> {
    const value = barcode.trim()
    if (!value) throw new Error('INVALID_BARCODE')

    const product = await prisma.product.findUnique({ where: { id: productId } })
    if (!product) throw new Error('PRODUCT_NOT_FOUND')

    const [productClash, aliasClash] = await Promise.all([
      prisma.product.findUnique({ where: { barcode: value } }),
      prisma.productBarcodeAlias.findUnique({ where: { barcode: value } }),
    ])
    if (productClash || aliasClash) throw new Error('BARCODE_EXISTS')

    await prisma.$transaction(async (tx) => {
      // Ensure the primary barcode is represented as an alias
      const existingAliases = await tx.productBarcodeAlias.count({ where: { productId } })
      if (existingAliases === 0) {
        await tx.productBarcodeAlias.create({
          data: { productId, barcode: product.barcode },
        })
      }
      await tx.productBarcodeAlias.create({ data: { productId, barcode: value } })
    })
    return this.listBarcodes(productId)
  }

  /**
   * Hide (active=false) or restore a barcode variant. A hidden barcode is
   * never assigned to stores; stores currently on it move to an active one on
   * their next order. At least one barcode must stay active — otherwise
   * throws 'LAST_ACTIVE_BARCODE'. Throws 'BARCODE_NOT_FOUND'.
   */
  static async setBarcodeActive(aliasId: string, active: boolean): Promise<ProductBarcodeView[]> {
    const alias = await prisma.productBarcodeAlias.findUnique({ where: { id: aliasId } })
    if (!alias) throw new Error('BARCODE_NOT_FOUND')

    if (!active) {
      const activeCount = await prisma.productBarcodeAlias.count({
        where: { productId: alias.productId, active: true },
      })
      if (alias.active && activeCount <= 1) throw new Error('LAST_ACTIVE_BARCODE')
    }

    await prisma.productBarcodeAlias.update({
      where: { id: aliasId },
      data: { active },
    })
    return this.listBarcodes(alias.productId)
  }

  private static toCatalogProduct(p: {
    id: string
    name: string
    barcode: string
    categoryId: string
    priceAgorot: number
    imagePath: string | null
    orderNote: string | null
    groupName: string | null
    status: ProductStatus
  }): CatalogProduct {    return {
      id: p.id,
      name: p.name,
      barcode: p.barcode,
      categoryId: p.categoryId,
      priceAgorot: p.priceAgorot,
      imagePath: p.imagePath,
      orderNote: p.orderNote,
      groupName: p.groupName,
      status: p.status,
    }
  }
}
