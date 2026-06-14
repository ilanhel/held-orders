import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export interface StoreView {
  id: string
  name: string
  code: string
  phone: string
  active: boolean
  userCount: number
  createdAt: Date
}

/** Normalize an Israeli phone to the canonical 05XXXXXXXX form, or null. */
function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, '')
  // 0501234567
  if (/^05\d{8}$/.test(digits)) return digits
  // 972501234567 -> 0501234567
  if (/^9725\d{8}$/.test(digits)) return '0' + digits.slice(3)
  return null
}

export class StoreService {
  /** All stores (active + inactive) with their user counts, newest first. */
  static async list(): Promise<StoreView[]> {
    const stores = await prisma.store.findMany({
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { users: true } } },
    })
    return stores.map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      phone: s.phone,
      active: s.active,
      userCount: s._count.users,
      createdAt: s.createdAt,
    }))
  }

  /**
   * Create a branch. Throws 'STORE_CODE_EXISTS' on a duplicate code,
   * 'INVALID_PHONE' for a malformed phone, 'INVALID_NAME'/'INVALID_CODE'.
   */
  static async create(input: {
    name: string
    code: string
    phone: string
  }): Promise<StoreView> {
    const name = input.name.trim()
    const code = input.code.trim()
    if (!name) throw new Error('INVALID_NAME')
    if (!code) throw new Error('INVALID_CODE')

    const phone = normalizePhone(input.phone)
    if (!phone) throw new Error('INVALID_PHONE')

    const existing = await prisma.store.findUnique({ where: { code } })
    if (existing) throw new Error('STORE_CODE_EXISTS')

    const store = await prisma.store.create({
      data: { name, code, phone },
    })
    return {
      id: store.id,
      name: store.name,
      code: store.code,
      phone: store.phone,
      active: store.active,
      userCount: 0,
      createdAt: store.createdAt,
    }
  }

  /**
   * Update a branch's name / phone / active flag. Throws 'STORE_NOT_FOUND'
   * or 'INVALID_PHONE'. The code is immutable once created.
   */
  static async update(
    id: string,
    input: { name?: string; phone?: string; active?: boolean }
  ): Promise<StoreView> {
    const store = await prisma.store.findUnique({ where: { id } })
    if (!store) throw new Error('STORE_NOT_FOUND')

    let phone: string | undefined
    if (input.phone !== undefined) {
      const normalized = normalizePhone(input.phone)
      if (!normalized) throw new Error('INVALID_PHONE')
      phone = normalized
    }

    const updated = await prisma.store.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
      include: { _count: { select: { users: true } } },
    })
    return {
      id: updated.id,
      name: updated.name,
      code: updated.code,
      phone: updated.phone,
      active: updated.active,
      userCount: updated._count.users,
      createdAt: updated.createdAt,
    }
  }

  /** Expose the shared phone normalizer for the user service / callers. */
  static normalizePhone = normalizePhone

  /**
   * Permanently delete a branch. Allowed only when it has NO orders (orders
   * are never deleted), otherwise throws 'STORE_HAS_ORDERS'. Any users tied to
   * the branch are detached (storeId set to null) by the schema's onDelete:
   * SetNull. Throws 'STORE_NOT_FOUND' if the branch does not exist.
   */
  static async remove(id: string): Promise<void> {
    const store = await prisma.store.findUnique({
      where: { id },
      include: { _count: { select: { orders: true } } },
    })
    if (!store) throw new Error('STORE_NOT_FOUND')
    if (store._count.orders > 0) throw new Error('STORE_HAS_ORDERS')

    await prisma.store.delete({ where: { id } })
  }
}
