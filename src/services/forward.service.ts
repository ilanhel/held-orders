import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export interface ForwardView {
  id: string
  name: string
  phone: string
  active: boolean
  products: Array<{ id: string; name: string; barcode: string }>
  categories: Array<{ id: string; name: string }>
}

/** An active destination with fast lookup sets, for matching order lines. */
export interface ForwardMatcher {
  id: string
  name: string
  phone: string
  productIds: Set<string>
  categoryNames: Set<string>
}

const FORWARD_INCLUDE = {
  products: {
    include: { product: { select: { id: true, name: true, barcode: true } } },
  },
  categories: {
    include: { category: { select: { id: true, name: true } } },
  },
} as const

function isValidPhone(v: string): boolean {
  return v.includes('@') || /^\+?\d{9,15}$/.test(v.replace(/[\s\-()]/g, ''))
}

/**
 * ForwardService — admin-managed WhatsApp forwarding destinations.
 * Each destination has a phone (or group chat id) plus a set of products
 * and/or whole categories; matching order lines are sent there on submit.
 */
export class ForwardService {
  static async list(): Promise<ForwardView[]> {
    const rows = await prisma.specialForward.findMany({
      orderBy: { createdAt: 'asc' },
      include: FORWARD_INCLUDE,
    })
    return rows.map((f) => this.toView(f))
  }

  /**
   * Create a destination. productIds/categoryIds are optional link lists.
   * Throws INVALID_NAME | INVALID_PHONE | PRODUCT_NOT_FOUND | CATEGORY_NOT_FOUND.
   */
  static async create(input: {
    name: string
    phone: string
    productIds?: string[]
    categoryIds?: string[]
  }): Promise<ForwardView> {
    const name = input.name.trim()
    const phone = input.phone.trim()
    if (!name) throw new Error('INVALID_NAME')
    if (!phone || !isValidPhone(phone)) throw new Error('INVALID_PHONE')

    const productIds = [...new Set(input.productIds ?? [])]
    const categoryIds = [...new Set(input.categoryIds ?? [])]
    await this.assertLinksExist(productIds, categoryIds)

    const created = await prisma.specialForward.create({
      data: {
        name,
        phone,
        products: { create: productIds.map((productId) => ({ productId })) },
        categories: { create: categoryIds.map((categoryId) => ({ categoryId })) },
      },
      include: FORWARD_INCLUDE,
    })
    return this.toView(created)
  }

  /**
   * Update a destination. When productIds/categoryIds are provided, the link
   * lists are replaced in full. Throws FORWARD_NOT_FOUND | INVALID_NAME |
   * INVALID_PHONE | PRODUCT_NOT_FOUND | CATEGORY_NOT_FOUND.
   */
  static async update(
    id: string,
    input: {
      name?: string
      phone?: string
      active?: boolean
      productIds?: string[]
      categoryIds?: string[]
    }
  ): Promise<ForwardView> {
    const existing = await prisma.specialForward.findUnique({ where: { id } })
    if (!existing) throw new Error('FORWARD_NOT_FOUND')

    const data: { name?: string; phone?: string; active?: boolean } = {}
    if (input.name !== undefined) {
      const name = input.name.trim()
      if (!name) throw new Error('INVALID_NAME')
      data.name = name
    }
    if (input.phone !== undefined) {
      const phone = input.phone.trim()
      if (!phone || !isValidPhone(phone)) throw new Error('INVALID_PHONE')
      data.phone = phone
    }
    if (input.active !== undefined) data.active = input.active

    const productIds = input.productIds ? [...new Set(input.productIds)] : undefined
    const categoryIds = input.categoryIds ? [...new Set(input.categoryIds)] : undefined
    await this.assertLinksExist(productIds ?? [], categoryIds ?? [])

    await prisma.$transaction([
      prisma.specialForward.update({ where: { id }, data }),
      ...(productIds
        ? [
            prisma.specialForwardProduct.deleteMany({ where: { forwardId: id } }),
            prisma.specialForwardProduct.createMany({
              data: productIds.map((productId) => ({ forwardId: id, productId })),
            }),
          ]
        : []),
      ...(categoryIds
        ? [
            prisma.specialForwardCategory.deleteMany({ where: { forwardId: id } }),
            prisma.specialForwardCategory.createMany({
              data: categoryIds.map((categoryId) => ({ forwardId: id, categoryId })),
            }),
          ]
        : []),
    ])

    const updated = await prisma.specialForward.findUnique({
      where: { id },
      include: FORWARD_INCLUDE,
    })
    return this.toView(updated!)
  }

  /** Delete a destination (links cascade). Throws FORWARD_NOT_FOUND. */
  static async remove(id: string): Promise<void> {
    const existing = await prisma.specialForward.findUnique({ where: { id } })
    if (!existing) throw new Error('FORWARD_NOT_FOUND')
    await prisma.specialForward.delete({ where: { id } })
  }

  /** Active destinations as matchers (product-id set + category-name set). */
  static async listMatchers(): Promise<ForwardMatcher[]> {
    const rows = await prisma.specialForward.findMany({
      where: { active: true },
      include: FORWARD_INCLUDE,
    })
    return rows.map((f) => ({
      id: f.id,
      name: f.name,
      phone: f.phone,
      productIds: new Set(f.products.map((p) => p.productId)),
      categoryNames: new Set(f.categories.map((c) => c.category.name)),
    }))
  }

  private static async assertLinksExist(productIds: string[], categoryIds: string[]) {
    if (productIds.length > 0) {
      const count = await prisma.product.count({ where: { id: { in: productIds } } })
      if (count !== productIds.length) throw new Error('PRODUCT_NOT_FOUND')
    }
    if (categoryIds.length > 0) {
      const count = await prisma.category.count({ where: { id: { in: categoryIds } } })
      if (count !== categoryIds.length) throw new Error('CATEGORY_NOT_FOUND')
    }
  }

  private static toView(f: {
    id: string
    name: string
    phone: string
    active: boolean
    products: Array<{ product: { id: string; name: string; barcode: string } }>
    categories: Array<{ category: { id: string; name: string } }>
  }): ForwardView {
    return {
      id: f.id,
      name: f.name,
      phone: f.phone,
      active: f.active,
      products: f.products.map((p) => p.product),
      categories: f.categories.map((c) => c.category),
    }
  }
}
