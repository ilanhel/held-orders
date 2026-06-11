import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import ExcelJS from 'exceljs'
import { PrismaClient, ProductStatus, Role, OrderStatus } from '@prisma/client'
import { OrderService } from '@/services/order.service'
import { OrderExportService } from '@/services/export.service'

const prisma = new PrismaClient()

let storeId: string
let userId: string
let warehouseUserId: string
let prodA: { id: string }
let prodB: { id: string }

async function resetDb() {
  await prisma.notificationLog.deleteMany()
  await prisma.orderStatusHistory.deleteMany()
  await prisma.orderItem.deleteMany()
  await prisma.order.deleteMany()
  await prisma.product.deleteMany()
  await prisma.category.deleteMany()
  await prisma.user.deleteMany()
  await prisma.store.deleteMany()
}

async function seed() {
  const store = await prisma.store.create({
    data: { name: 'HELD Export Test', code: 'EXP-01', phone: '0559999999', active: true },
  })
  const user = await prisma.user.create({
    data: { name: 'F', phone: '0559999991', role: Role.FRANCHISEE, storeId: store.id, active: true },
  })
  const wh = await prisma.user.create({
    data: { name: 'W', phone: '0559999992', role: Role.WAREHOUSE, active: true },
  })
  const catA = await prisma.category.create({ data: { name: 'קטא', sortOrder: 10 } })
  const catB = await prisma.category.create({ data: { name: 'קטב', sortOrder: 20 } })
  const a = await prisma.product.create({
    data: { name: 'מוצר אקס', barcode: 'EXP-A', categoryId: catA.id, priceAgorot: 4500, status: ProductStatus.ACTIVE },
  })
  const b = await prisma.product.create({
    data: { name: 'מוצר בית', barcode: 'EXP-B', categoryId: catB.id, priceAgorot: 7700, status: ProductStatus.ACTIVE },
  })
  storeId = store.id
  userId = user.id
  warehouseUserId = wh.id
  prodA = { id: a.id }
  prodB = { id: b.id }
}

describe('OrderExportService', () => {
  beforeEach(async () => {
    await resetDb()
    await seed()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('throws on unknown order', async () => {
    await expect(OrderExportService.buildOrderXlsx('nope')).rejects.toThrow(
      'ORDER_NOT_FOUND'
    )
  })

  it('builds a workbook with header, rows, and totals', async () => {
    const d = await OrderService.getOrCreateDraft(storeId, userId)
    await OrderService.setItemQty(d.id, prodA.id, 2)
    await OrderService.setItemQty(d.id, prodB.id, 3)
    const s = await OrderService.submitDraft(d.id, userId)
    await OrderService.transitionStatus(s.id, OrderStatus.RECEIVED, warehouseUserId)
    await OrderService.updateItemSupply(s.id, s.items[0].id, 2, true)
    await OrderService.updateItemSupply(s.id, s.items[1].id, 1, true) // shortage

    const { buffer, filename } = await OrderExportService.buildOrderXlsx(s.id)

    expect(filename).toBe(`order-${s.number}.xlsx`)
    expect(buffer.length).toBeGreaterThan(1000)

    // Verify the XLSX is parseable & contains expected data
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer as unknown as ArrayBuffer)
    const ws = wb.getWorksheet('הזמנה')!
    expect(ws).toBeDefined()
    expect(ws.views[0].rightToLeft).toBe(true)

    // Title row
    expect(String(ws.getCell('A1').value)).toContain(`#${s.number}`)

    // Headers in row 5
    expect(ws.getCell('A5').value).toBe('קטגוריה')
    expect(ws.getCell('D5').value).toBe('כמות שהוזמנה')
    expect(ws.getCell('E5').value).toBe('כמות סופקה')

    // Two data rows starting at row 6
    const productNames: string[] = []
    for (let r = 6; r <= 7; r++) {
      productNames.push(String(ws.getCell(`B${r}`).value))
    }
    expect(productNames).toContain('מוצר אקס')
    expect(productNames).toContain('מוצר בית')

    // Totals at end (row 9 since 2 items + blank separator)
    const totalRow = ws.getRow(9)
    expect(String(totalRow.getCell(2).value)).toBe('סה״כ')
    // 2*45.00 + 3*77.00 = 321.00
    expect(totalRow.getCell(6).value).toBeCloseTo(321.0, 2)
  })
})
