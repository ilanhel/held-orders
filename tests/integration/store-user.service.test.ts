import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { PrismaClient, Role } from '@prisma/client'
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

describe('StoreService', () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  describe('create', () => {
    it('creates a branch with a normalized phone', async () => {
      const store = await StoreService.create({
        name: 'סניף תל אביב',
        code: 'TLV',
        phone: '054-5268484',
      })
      expect(store.name).toBe('סניף תל אביב')
      expect(store.code).toBe('TLV')
      expect(store.phone).toBe('0545268484')
      expect(store.active).toBe(true)
      expect(store.userCount).toBe(0)
    })

    it('normalizes a 972 phone', async () => {
      const store = await StoreService.create({
        name: 'סניף',
        code: 'X1',
        phone: '972545268484',
      })
      expect(store.phone).toBe('0545268484')
    })

    it('throws STORE_CODE_EXISTS on a duplicate code', async () => {
      await StoreService.create({ name: 'א', code: 'DUP', phone: '0501234567' })
      await expect(
        StoreService.create({ name: 'ב', code: 'DUP', phone: '0501234568' })
      ).rejects.toThrow('STORE_CODE_EXISTS')
    })

    it('throws INVALID_PHONE for a malformed phone', async () => {
      await expect(
        StoreService.create({ name: 'א', code: 'Y1', phone: '12345' })
      ).rejects.toThrow('INVALID_PHONE')
    })

    it('throws INVALID_NAME for an empty name', async () => {
      await expect(
        StoreService.create({ name: '   ', code: 'Z1', phone: '0501234567' })
      ).rejects.toThrow('INVALID_NAME')
    })
  })

  describe('list', () => {
    it('returns stores with user counts, active first', async () => {
      const a = await StoreService.create({ name: 'פעיל', code: 'A', phone: '0501234567' })
      const b = await StoreService.create({ name: 'מושבת', code: 'B', phone: '0501234568' })
      await StoreService.update(b.id, { active: false })
      await prisma.user.create({
        data: { name: 'זכיין', phone: '0509999999', role: Role.FRANCHISEE, storeId: a.id },
      })

      const list = await StoreService.list()
      expect(list).toHaveLength(2)
      expect(list[0].active).toBe(true)
      expect(list[0].userCount).toBe(1)
      expect(list[1].active).toBe(false)
    })
  })

  describe('update', () => {
    it('updates name and active, code stays immutable', async () => {
      const s = await StoreService.create({ name: 'ישן', code: 'KEEP', phone: '0501234567' })
      const updated = await StoreService.update(s.id, { name: 'חדש', active: false })
      expect(updated.name).toBe('חדש')
      expect(updated.active).toBe(false)
      expect(updated.code).toBe('KEEP')
    })

    it('throws STORE_NOT_FOUND for a missing id', async () => {
      await expect(
        StoreService.update('nonexistent', { active: false })
      ).rejects.toThrow('STORE_NOT_FOUND')
    })
  })

  describe('remove', () => {
    it('deletes a branch that has no orders', async () => {
      const s = await StoreService.create({ name: 'דמו', code: 'DEMO', phone: '0501234567' })
      await StoreService.remove(s.id)
      const list = await StoreService.list()
      expect(list.find((x) => x.id === s.id)).toBeUndefined()
    })

    it('detaches users when its branch is deleted', async () => {
      const s = await StoreService.create({ name: 'דמו', code: 'DEMO2', phone: '0501234567' })
      const u = await prisma.user.create({
        data: { name: 'זכיין', phone: '0508888888', role: Role.FRANCHISEE, storeId: s.id },
      })
      await StoreService.remove(s.id)
      const after = await prisma.user.findUnique({ where: { id: u.id } })
      expect(after?.storeId).toBeNull()
    })

    it('throws STORE_HAS_ORDERS when the branch has orders', async () => {
      const s = await StoreService.create({ name: 'עם הזמנות', code: 'ORD', phone: '0501234567' })
      await prisma.order.create({
        data: { storeId: s.id, createdBy: 'tester' },
      })
      await expect(StoreService.remove(s.id)).rejects.toThrow('STORE_HAS_ORDERS')
    })

    it('throws STORE_NOT_FOUND for a missing id', async () => {
      await expect(StoreService.remove('nope')).rejects.toThrow('STORE_NOT_FOUND')
    })
  })
})

describe('UserService', () => {
  let store: { id: string }

  beforeEach(async () => {
    await resetDb()
    store = await StoreService.create({ name: 'סניף', code: 'S1', phone: '0501234567' })
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  describe('create', () => {
    it('creates a franchisee tied to a store', async () => {
      const u = await UserService.create({
        name: 'זכיין',
        phone: '0545268484',
        role: Role.FRANCHISEE,
        storeId: store.id,
      })
      expect(u.role).toBe(Role.FRANCHISEE)
      expect(u.storeId).toBe(store.id)
      expect(u.storeName).toBe('סניף')
      expect(u.phone).toBe('0545268484')
    })

    it('throws STORE_REQUIRED for a franchisee without a store', async () => {
      await expect(
        UserService.create({ name: 'זכיין', phone: '0509999999', role: Role.FRANCHISEE })
      ).rejects.toThrow('STORE_REQUIRED')
    })

    it('nulls the store for non-franchisee roles', async () => {
      const u = await UserService.create({
        name: 'מחסנאי',
        phone: '0509999998',
        role: Role.WAREHOUSE,
        storeId: store.id,
      })
      expect(u.storeId).toBeNull()
    })

    it('throws PHONE_EXISTS on a duplicate phone', async () => {
      await UserService.create({
        name: 'א',
        phone: '0509999997',
        role: Role.FRANCHISEE,
        storeId: store.id,
      })
      await expect(
        UserService.create({
          name: 'ב',
          phone: '0509999997',
          role: Role.FRANCHISEE,
          storeId: store.id,
        })
      ).rejects.toThrow('PHONE_EXISTS')
    })

    it('throws STORE_NOT_FOUND for an unknown store', async () => {
      await expect(
        UserService.create({
          name: 'זכיין',
          phone: '0509999996',
          role: Role.FRANCHISEE,
          storeId: 'nope',
        })
      ).rejects.toThrow('STORE_NOT_FOUND')
    })
  })

  describe('list', () => {
    it('filters by role', async () => {
      await UserService.create({ name: 'זכיין', phone: '0501111111', role: Role.FRANCHISEE, storeId: store.id })
      await UserService.create({ name: 'מחסנאי', phone: '0502222222', role: Role.WAREHOUSE })

      const franchisees = await UserService.list(Role.FRANCHISEE)
      expect(franchisees).toHaveLength(1)
      expect(franchisees[0].role).toBe(Role.FRANCHISEE)
      expect(franchisees[0].storeName).toBe('סניף')
    })
  })

  describe('update', () => {
    it('updates name and active flag', async () => {
      const u = await UserService.create({
        name: 'ישן',
        phone: '0503333333',
        role: Role.FRANCHISEE,
        storeId: store.id,
      })
      const updated = await UserService.update(u.id, { name: 'חדש', active: false })
      expect(updated.name).toBe('חדש')
      expect(updated.active).toBe(false)
    })

    it('throws PHONE_EXISTS when changing to a taken phone', async () => {
      const a = await UserService.create({ name: 'א', phone: '0504444444', role: Role.WAREHOUSE })
      await UserService.create({ name: 'ב', phone: '0505555555', role: Role.WAREHOUSE })
      await expect(
        UserService.update(a.id, { phone: '0505555555' })
      ).rejects.toThrow('PHONE_EXISTS')
    })

    it('throws USER_NOT_FOUND for a missing id', async () => {
      await expect(
        UserService.update('nope', { active: false })
      ).rejects.toThrow('USER_NOT_FOUND')
    })
  })
})
