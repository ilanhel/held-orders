import { PrismaClient, Role } from '@prisma/client'
import { StoreService } from './store.service'

const prisma = new PrismaClient()

export interface UserView {
  id: string
  name: string
  phone: string
  role: Role
  storeId: string | null
  storeName: string | null
  active: boolean
  createdAt: Date
}

function toView(u: {
  id: string
  name: string
  phone: string
  role: Role
  storeId: string | null
  active: boolean
  createdAt: Date
  store?: { name: string } | null
}): UserView {
  return {
    id: u.id,
    name: u.name,
    phone: u.phone,
    role: u.role,
    storeId: u.storeId,
    storeName: u.store?.name ?? null,
    active: u.active,
    createdAt: u.createdAt,
  }
}

export class UserService {
  /** All users, newest active first. Optional role filter. */
  static async list(role?: Role): Promise<UserView[]> {
    const users = await prisma.user.findMany({
      where: role ? { role } : undefined,
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      include: { store: { select: { name: true } } },
    })
    return users.map(toView)
  }

  /**
   * Create a user. Throws 'PHONE_EXISTS' on a duplicate phone,
   * 'INVALID_PHONE', 'INVALID_NAME', 'STORE_REQUIRED' (a FRANCHISEE must have
   * a store), or 'STORE_NOT_FOUND'.
   */
  static async create(input: {
    name: string
    phone: string
    role: Role
    storeId?: string | null
  }): Promise<UserView> {
    const name = input.name.trim()
    if (!name) throw new Error('INVALID_NAME')

    const phone = StoreService.normalizePhone(input.phone)
    if (!phone) throw new Error('INVALID_PHONE')

    let storeId: string | null = input.storeId ?? null
    if (input.role === Role.FRANCHISEE) {
      if (!storeId) throw new Error('STORE_REQUIRED')
    } else {
      // Non-franchisee roles are not tied to a branch.
      storeId = null
    }

    if (storeId) {
      const store = await prisma.store.findUnique({ where: { id: storeId } })
      if (!store) throw new Error('STORE_NOT_FOUND')
    }

    const existing = await prisma.user.findUnique({ where: { phone } })
    if (existing) throw new Error('PHONE_EXISTS')

    const user = await prisma.user.create({
      data: { name, phone, role: input.role, storeId },
      include: { store: { select: { name: true } } },
    })
    return toView(user)
  }

  /**
   * Update a user's name / phone / store / active flag. Throws
   * 'USER_NOT_FOUND', 'INVALID_PHONE', 'PHONE_EXISTS', or 'STORE_NOT_FOUND'.
   */
  static async update(
    id: string,
    input: {
      name?: string
      phone?: string
      storeId?: string | null
      active?: boolean
    }
  ): Promise<UserView> {
    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) throw new Error('USER_NOT_FOUND')

    let phone: string | undefined
    if (input.phone !== undefined) {
      const normalized = StoreService.normalizePhone(input.phone)
      if (!normalized) throw new Error('INVALID_PHONE')
      if (normalized !== user.phone) {
        const clash = await prisma.user.findUnique({ where: { phone: normalized } })
        if (clash) throw new Error('PHONE_EXISTS')
      }
      phone = normalized
    }

    if (input.storeId) {
      const store = await prisma.store.findUnique({ where: { id: input.storeId } })
      if (!store) throw new Error('STORE_NOT_FOUND')
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(input.storeId !== undefined ? { storeId: input.storeId } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
      include: { store: { select: { name: true } } },
    })
    return toView(updated)
  }
}
