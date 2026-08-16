import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { PrismaClient, Role } from '@prisma/client'
import { AuthService } from '@/services/auth.service'
import { StoreService } from '@/services/store.service'
import { UserService } from '@/services/user.service'

const prisma = new PrismaClient()

async function resetDb() {
  await prisma.orderItem.deleteMany()
  await prisma.orderStatusHistory.deleteMany()
  await prisma.order.deleteMany()
  await prisma.user.deleteMany()
  await prisma.store.deleteMany()
}

async function makeStore(code = 'TLV') {
  return StoreService.create({ name: 'סניף ' + code, code, phone: '0501234567' })
}

describe('AuthService', () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  describe('code issuing', () => {
    it('store creation auto-issues a 6-digit branch password', async () => {
      const store = await makeStore()
      expect(store.loginCode).toMatch(/^\d{6}$/)
    })

    it('issueStoreCode replaces the branch password', async () => {
      const store = await makeStore()
      const before = store.loginCode
      const code = await AuthService.issueStoreCode(store.id)
      expect(code).toMatch(/^\d{6}$/)
      expect(code).not.toBe(before)
      const fresh = await prisma.store.findUnique({ where: { id: store.id } })
      expect(fresh?.loginCode).toBe(code)
    })

    it('issueStoreCode throws STORE_NOT_FOUND for a missing store', async () => {
      await expect(AuthService.issueStoreCode('nope')).rejects.toThrow(
        'STORE_NOT_FOUND'
      )
    })

    it('staff user creation auto-issues a personal password', async () => {
      const user = await UserService.create({
        name: 'מחסן',
        phone: '0521111111',
        role: Role.WAREHOUSE,
      })
      expect(user.loginCode).toMatch(/^\d{6}$/)
    })

    it('franchisee user creation does NOT issue a personal password', async () => {
      const store = await makeStore()
      const user = await UserService.create({
        name: 'זכיין',
        phone: '0522222222',
        role: Role.FRANCHISEE,
        storeId: store.id,
      })
      expect(user.loginCode).toBeNull()
    })

    it('issueUserCode refuses franchisees', async () => {
      const store = await makeStore()
      const user = await UserService.create({
        name: 'זכיין',
        phone: '0522222222',
        role: Role.FRANCHISEE,
        storeId: store.id,
      })
      await expect(AuthService.issueUserCode(user.id)).rejects.toThrow(
        'FRANCHISEE_USES_STORE_CODE'
      )
    })

    it('issueUserCode replaces a staff password', async () => {
      const user = await UserService.create({
        name: 'מנהל',
        phone: '0523333333',
        role: Role.ADMIN,
      })
      const code = await AuthService.issueUserCode(user.id)
      expect(code).toMatch(/^\d{6}$/)
      expect(code).not.toBe(user.loginCode)
    })
  })

  describe('loginWithCode', () => {
    it('branch password logs in as the branch franchisee', async () => {
      const store = await makeStore()
      const user = await UserService.create({
        name: 'זכיין',
        phone: '0522222222',
        role: Role.FRANCHISEE,
        storeId: store.id,
      })
      const login = await AuthService.loginWithCode(store.loginCode!)
      expect(login.id).toBe(user.id)
      expect(login.role).toBe(Role.FRANCHISEE)
      expect(login.storeId).toBe(store.id)
      expect(login.storeName).toBe(store.name)
    })

    it('skips inactive franchisees and picks an active one', async () => {
      const store = await makeStore()
      const u1 = await UserService.create({
        name: 'ישן',
        phone: '0522222221',
        role: Role.FRANCHISEE,
        storeId: store.id,
      })
      await UserService.update(u1.id, { active: false })
      const u2 = await UserService.create({
        name: 'חדש',
        phone: '0522222223',
        role: Role.FRANCHISEE,
        storeId: store.id,
      })
      const login = await AuthService.loginWithCode(store.loginCode!)
      expect(login.id).toBe(u2.id)
    })

    it('auto-creates a franchisee user when the branch has none', async () => {
      const store = await makeStore()
      const login = await AuthService.loginWithCode(store.loginCode!)
      expect(login.role).toBe(Role.FRANCHISEE)
      expect(login.storeId).toBe(store.id)
      expect(login.name).toBe(store.name)
      const created = await prisma.user.findFirst({
        where: { storeId: store.id, role: Role.FRANCHISEE, active: true },
      })
      expect(created).not.toBeNull()
      // Second login reuses the same auto-created user.
      const again = await AuthService.loginWithCode(store.loginCode!)
      expect(again.id).toBe(login.id)
    })

    it('throws STORE_INACTIVE for a deactivated branch', async () => {
      const store = await makeStore()
      await StoreService.update(store.id, { active: false })
      await expect(AuthService.loginWithCode(store.loginCode!)).rejects.toThrow(
        'STORE_INACTIVE'
      )
    })

    it('personal password logs in the staff user', async () => {
      const user = await UserService.create({
        name: 'מחסן',
        phone: '0521111111',
        role: Role.WAREHOUSE,
      })
      const login = await AuthService.loginWithCode(user.loginCode!)
      expect(login.id).toBe(user.id)
      expect(login.role).toBe(Role.WAREHOUSE)
    })

    it('throws USER_INACTIVE for a deactivated staff user', async () => {
      const user = await UserService.create({
        name: 'מחסן',
        phone: '0521111111',
        role: Role.WAREHOUSE,
      })
      await UserService.update(user.id, { active: false })
      await expect(AuthService.loginWithCode(user.loginCode!)).rejects.toThrow(
        'USER_INACTIVE'
      )
    })

    it('throws INVALID_CODE for an unknown password', async () => {
      await expect(AuthService.loginWithCode('000000')).rejects.toThrow(
        'INVALID_CODE'
      )
    })

    it('an old branch password stops working after re-issue', async () => {
      const store = await makeStore()
      await UserService.create({
        name: 'זכיין',
        phone: '0522222222',
        role: Role.FRANCHISEE,
        storeId: store.id,
      })
      const oldCode = store.loginCode!
      await AuthService.issueStoreCode(store.id)
      await expect(AuthService.loginWithCode(oldCode)).rejects.toThrow(
        'INVALID_CODE'
      )
    })
  })
})
