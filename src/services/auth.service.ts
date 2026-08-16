import { PrismaClient, Role } from '@prisma/client'
import { randomInt } from 'crypto'

const prisma = new PrismaClient()

export interface LoginUser {
  id: string
  name: string
  phone: string
  role: Role
  storeId: string | null
  storeName: string | null
}

/**
 * AuthService — password ("login code") based authentication.
 *
 * Two kinds of passwords, both short 6-digit codes, unique across BOTH kinds:
 *   - Branch password (Store.loginCode): shared by the branch. Logging in with
 *     it opens a franchisee session for that branch. Not tied to any phone —
 *     the franchisee's phone is kept only for WhatsApp notifications.
 *   - Personal password (User.loginCode): for WAREHOUSE / ADMIN users.
 */
export class AuthService {
  /** Random 6-digit code (leading zeros allowed). */
  static generateCode(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, '0')
  }

  /** Generate a code that is unique across stores AND users. */
  static async uniqueCode(): Promise<string> {
    for (let i = 0; i < 30; i++) {
      const code = this.generateCode()
      const [store, user] = await Promise.all([
        prisma.store.findUnique({ where: { loginCode: code }, select: { id: true } }),
        prisma.user.findUnique({ where: { loginCode: code }, select: { id: true } }),
      ])
      if (!store && !user) return code
    }
    throw new Error('CODE_GENERATION_FAILED')
  }

  /**
   * Issue (or re-issue) the branch password. The previous password stops
   * working immediately. Throws 'STORE_NOT_FOUND'.
   */
  static async issueStoreCode(storeId: string): Promise<string> {
    const store = await prisma.store.findUnique({ where: { id: storeId } })
    if (!store) throw new Error('STORE_NOT_FOUND')
    const code = await this.uniqueCode()
    await prisma.store.update({ where: { id: storeId }, data: { loginCode: code } })
    return code
  }

  /**
   * Issue (or re-issue) a personal password for a WAREHOUSE/ADMIN user.
   * Franchisees use their branch password. Throws 'USER_NOT_FOUND' or
   * 'FRANCHISEE_USES_STORE_CODE'.
   */
  static async issueUserCode(userId: string): Promise<string> {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new Error('USER_NOT_FOUND')
    if (user.role === Role.FRANCHISEE) throw new Error('FRANCHISEE_USES_STORE_CODE')
    const code = await this.uniqueCode()
    await prisma.user.update({ where: { id: userId }, data: { loginCode: code } })
    return code
  }

  /**
   * Log in with a password. A branch password opens a session as the branch's
   * (oldest active) franchisee user — if the branch has none, one is created
   * automatically from the branch's own name and phone, so a branch password
   * ALWAYS works. A personal password logs in that staff user.
   * Throws 'INVALID_CODE', 'STORE_INACTIVE' or 'USER_INACTIVE'.
   */
  static async loginWithCode(code: string): Promise<LoginUser> {
    const store = await prisma.store.findUnique({ where: { loginCode: code } })
    if (store) {
      if (!store.active) throw new Error('STORE_INACTIVE')
      let user = await prisma.user.findFirst({
        where: { storeId: store.id, role: Role.FRANCHISEE, active: true },
        orderBy: { createdAt: 'asc' },
      })
      if (!user) {
        // Self-heal: the branch has no order user yet — create one.
        user = await prisma.user.create({
          data: {
            name: store.name,
            phone: store.phone,
            role: Role.FRANCHISEE,
            storeId: store.id,
          },
        })
      }
      return {
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: user.role,
        storeId: store.id,
        storeName: store.name,
      }
    }

    const user = await prisma.user.findUnique({
      where: { loginCode: code },
      include: { store: { select: { id: true, name: true } } },
    })
    if (!user || user.role === Role.FRANCHISEE) throw new Error('INVALID_CODE')
    if (!user.active) throw new Error('USER_INACTIVE')
    return {
      id: user.id,
      name: user.name,
      phone: user.phone,
      role: user.role,
      storeId: user.store?.id ?? null,
      storeName: user.store?.name ?? null,
    }
  }
}
