import ExcelJS from 'exceljs'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Build a Hebrew/RTL XLSX picking sheet for a single order.
 * Returns a Buffer ready to stream as response body.
 */
export class OrderExportService {
  static async buildOrderXlsx(orderId: string): Promise<{ buffer: Buffer; filename: string }> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        store: true,
        items: {
          orderBy: [{ productName: 'asc' }],
          include: { product: { include: { category: true } } },
        },
      },
    })
    if (!order) throw new Error('ORDER_NOT_FOUND')

    const wb = new ExcelJS.Workbook()
    wb.creator = 'HELD Orders'
    wb.created = new Date()
    wb.views = [{ rightToLeft: true } as unknown as ExcelJS.WorkbookView]

    const ws = wb.addWorksheet('הזמנה', {
      views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
      properties: { defaultRowHeight: 20 },
    })

    // Column layout matches the accounting system exactly so the warehouse can
    // copy-paste the item rows straight into it without re-typing.
    // (RTL sheet: column A appears on the right.)
    //   A=ש.  B=קוד  C=שם פריט  D=מידה  E=נפח  F=כמות  G=מחיר  H=% הנחה  I=סכום
    const headers = ['ש.', 'קוד', 'שם פריט', 'מידה', 'נפח', 'כמות', 'מחיר', '% הנחה', 'סכום']
    const headerRow = ws.getRow(1)
    headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1)
      cell.value = h
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEF4444' } }
      cell.border = {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' },
      }
    })
    headerRow.height = 24

    // Sort by category (picking order) then product name, but keep a single flat
    // table — no group/separator rows — so the block pastes cleanly.
    const items = [...order.items].sort((a, b) => {
      const so = (a.product?.category?.sortOrder ?? 999) - (b.product?.category?.sortOrder ?? 999)
      if (so !== 0) return so
      return a.productName.localeCompare(b.productName, 'he')
    })

    let rowIdx = 2
    let subtotalAgorot = 0
    items.forEach((item, i) => {
      // Quantity reflects what was actually supplied (after shortage updates);
      // falls back to the ordered amount before picking has started.
      const qty = item.qtySupplied ?? item.qtyOrdered
      const lineAgorot = item.priceAgorot * qty
      subtotalAgorot += lineAgorot

      const row = ws.getRow(rowIdx)
      row.getCell(1).value = i + 1 // ש.
      row.getCell(2).value = item.productBarcode // קוד
      row.getCell(3).value = item.productName // שם פריט
      row.getCell(4).value = '' // מידה
      row.getCell(5).value = '' // נפח
      row.getCell(6).value = qty // כמות
      row.getCell(7).value = item.priceAgorot / 100 // מחיר
      row.getCell(8).value = 0 // % הנחה
      row.getCell(9).value = lineAgorot / 100 // סכום

      for (let c = 1; c <= 9; c++) {
        const cell = row.getCell(c)
        cell.alignment = { horizontal: c === 3 ? 'right' : 'center', vertical: 'middle' }
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        }
      }
      row.getCell(7).numFmt = '#,##0.00'
      row.getCell(9).numFmt = '#,##0.00'

      // Highlight shortage rows (supplied < ordered).
      if (item.qtySupplied !== null && item.qtySupplied < item.qtyOrdered) {
        for (let c = 1; c <= 9; c++) {
          row.getCell(c).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFEF3C7' },
          }
        }
      }
      rowIdx++
    })

    // Totals block (below a blank separator row) — kept out of the item table
    // so selecting the items for paste stays simple.
    const vatAgorot = Math.round(subtotalAgorot * 0.18)
    const totalAgorot = subtotalAgorot + vatAgorot
    const totals: Array<[string, number]> = [
      ['סה״כ', subtotalAgorot / 100],
      ['מע״מ 18%', vatAgorot / 100],
      ['סה״כ כולל מע״מ', totalAgorot / 100],
    ]
    let tRow = rowIdx + 1
    for (const [label, value] of totals) {
      const r = ws.getRow(tRow)
      r.getCell(8).value = label
      r.getCell(8).font = { bold: true }
      r.getCell(8).alignment = { horizontal: 'right' }
      r.getCell(9).value = value
      r.getCell(9).numFmt = '#,##0.00 "₪"'
      r.getCell(9).font = { bold: true }
      r.getCell(9).alignment = { horizontal: 'center' }
      tRow++
    }

    // Order metadata footer (does not interfere with the item block).
    const metaRow = ws.getRow(tRow + 1)
    metaRow.getCell(3).value = `הזמנה #${order.number ?? '—'} · ${order.store.name} · ${(
      order.submittedAt ?? order.createdAt
    ).toLocaleString('he-IL')}`
    metaRow.getCell(3).font = { color: { argb: 'FF9CA3AF' }, size: 10 }
    metaRow.getCell(3).alignment = { horizontal: 'right' }

    // Column widths
    ws.getColumn(1).width = 6 // ש.
    ws.getColumn(2).width = 16 // קוד
    ws.getColumn(3).width = 42 // שם פריט
    ws.getColumn(4).width = 10 // מידה
    ws.getColumn(5).width = 10 // נפח
    ws.getColumn(6).width = 9 // כמות
    ws.getColumn(7).width = 12 // מחיר
    ws.getColumn(8).width = 10 // % הנחה
    ws.getColumn(9).width = 14 // סכום

    // ---------------------------------------------------------------------------
    // Second sheet: a clean ERP-ingestion block with exactly three columns
    //   A=ברקוד  B=כמות  C=מחיר
    // The picker works off the first sheet (which keeps product names); the
    // bookkeeper selects A:C here and pastes it straight into the ERP invoice
    // import — no product name needed there.
    // ---------------------------------------------------------------------------
    const erp = wb.addWorksheet('קליטה ל-ERP', {
      views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
    })
    const erpHeaders = ['ברקוד', 'כמות', 'מחיר']
    const erpHeaderRow = erp.getRow(1)
    erpHeaders.forEach((h, i) => {
      const cell = erpHeaderRow.getCell(i + 1)
      cell.value = h
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111827' } }
    })
    erpHeaderRow.height = 22

    let erpRowIdx = 2
    items.forEach((item) => {
      const qty = item.qtySupplied ?? item.qtyOrdered
      const r = erp.getRow(erpRowIdx)
      r.getCell(1).value = item.productBarcode // ברקוד
      r.getCell(2).value = qty // כמות
      r.getCell(3).value = item.priceAgorot / 100 // מחיר (per unit, net)
      r.getCell(2).alignment = { horizontal: 'center' }
      r.getCell(3).numFmt = '#,##0.00'
      r.getCell(3).alignment = { horizontal: 'center' }
      erpRowIdx++
    })
    erp.getColumn(1).width = 18 // ברקוד
    erp.getColumn(2).width = 10 // כמות
    erp.getColumn(3).width = 12 // מחיר

    const buffer = (await wb.xlsx.writeBuffer()) as unknown as Buffer
    const numberPart = order.number ? String(order.number) : 'draft'
    const filename = `order-${numberPart}.xlsx`
    return { buffer, filename }
  }
}
