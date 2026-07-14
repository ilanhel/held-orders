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

    // Accounting column order in header row 1
    expect(ws.getCell('A1').value).toBe('ש.')
    expect(ws.getCell('B1').value).toBe('קוד')
    expect(ws.getCell('C1').value).toBe('שם פריט')
    expect(ws.getCell('F1').value).toBe('כמות')
    expect(ws.getCell('G1').value).toBe('מחיר')
    expect(ws.getCell('I1').value).toBe('סכום')

    // Two data rows starting at row 2, sorted by category sortOrder (catA=10 first)
    expect(ws.getCell('C2').value).toBe('מוצר אקס')
    expect(ws.getCell('C3').value).toBe('מוצר בית')

    // Quantity column reflects the SUPPLIED amount (prodB shorted 3 -> 1)
    expect(ws.getCell('F2').value).toBe(2)
    expect(ws.getCell('F3').value).toBe(1)
    // Line totals: 2*45.00 = 90.00, 1*77.00 = 77.00
    expect(ws.getCell('I2').value).toBeCloseTo(90.0, 2)
    expect(ws.getCell('I3').value).toBeCloseTo(77.0, 2)

    // Totals block below a blank separator row (rows 5..7).
    expect(String(ws.getCell('H5').value)).toBe('סה״כ')
    expect(ws.getCell('I5').value).toBeCloseTo(167.0, 2) // 90 + 77 (supplied-based)
    expect(String(ws.getCell('H6').value)).toBe('מע״מ 18%')
    expect(ws.getCell('I6').value).toBeCloseTo(30.06, 2)
    expect(String(ws.getCell('H7').value)).toBe('סה״כ כולל מע״מ')
    expect(ws.getCell('I7').value).toBeCloseTo(197.06, 2)

    // ERP-ingestion sheet: raw data only — A=ברקוד, B=כמות (supplied), no
    // header row, no line numbers, no price.
    const erp = wb.getWorksheet('קליטה ל-ERP')!
    expect(erp).toBeDefined()
    expect(erp.getCell('A1').value).toBe('EXP-A')
    expect(erp.getCell('B1').value).toBe(2)
    expect(erp.getCell('A2').value).toBe('EXP-B')
    expect(erp.getCell('B2').value).toBe(1) // supplied (shortage)
    expect(erp.getCell('C1').value).toBeNull()
    expect(erp.getCell('C2').value).toBeNull()
    expect(erp.getCell('A3').value).toBeNull()
  })

  it('buildErpXlsx: single sheet, barcode+qty only, zero-qty lines omitted', async () => {
    const d = await OrderService.getOrCreateDraft(storeId, userId)
    await OrderService.setItemQty(d.id, prodA.id, 4)
    await OrderService.setItemQty(d.id, prodB.id, 2)
    const s = await OrderService.submitDraft(d.id, userId)
    await OrderService.transitionStatus(s.id, OrderStatus.RECEIVED, warehouseUserId)
    await OrderService.updateItemSupply(s.id, s.items[0].id, 3, true) // shortage 4→3
    await OrderService.updateItemSupply(s.id, s.items[1].id, 0, true) // nothing supplied

    const { buffer, filename } = await OrderExportService.buildErpXlsx(s.id)
    expect(filename).toBe(`erp-${s.number}.xlsx`)

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer as unknown as ArrayBuffer)
    expect(wb.worksheets).toHaveLength(1)
    const ws = wb.worksheets[0]
    // Only the supplied line, starting at row 1, two columns, nothing else.
    expect(ws.getCell('A1').value).toBe('EXP-A')
    expect(ws.getCell('B1').value).toBe(3)
    expect(ws.getCell('C1').value).toBeNull()
    expect(ws.getCell('A2').value).toBeNull() // zero-qty line omitted
  })
})
