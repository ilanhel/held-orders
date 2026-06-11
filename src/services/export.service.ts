import ExcelJS from 'exceljs'
import { PrismaClient } from '@prisma/client'
import { i18n } from '@/lib/i18n'

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
      views: [{ rightToLeft: true, state: 'frozen', ySplit: 5 }],
      properties: { defaultRowHeight: 20 },
    })

    // Header
    ws.mergeCells('A1:F1')
    ws.getCell('A1').value = `הזמנה #${order.number ?? '—'}`
    ws.getCell('A1').font = { bold: true, size: 18 }
    ws.getCell('A1').alignment = { horizontal: 'right', vertical: 'middle' }

    ws.getCell('A2').value = 'חנות:'
    ws.getCell('B2').value = order.store.name
    ws.getCell('A3').value = 'סטטוס:'
    ws.getCell('B3').value = i18n.orders.statuses[order.status] ?? order.status
    ws.getCell('A4').value = 'תאריך:'
    ws.getCell('B4').value = (order.submittedAt ?? order.createdAt).toLocaleString('he-IL')
    for (let r = 2; r <= 4; r++) {
      ws.getCell(`A${r}`).font = { bold: true }
      ws.getCell(`A${r}`).alignment = { horizontal: 'right' }
      ws.getCell(`B${r}`).alignment = { horizontal: 'right' }
    }

    // Table headers (row 5)
    const headers = [
      'קטגוריה',
      'שם מוצר',
      'ברקוד',
      'כמות שהוזמנה',
      'כמות סופקה',
      'מחיר ליחידה (₪)',
    ]
    const headerRow = ws.getRow(5)
    headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1)
      cell.value = h
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.alignment = { horizontal: 'right', vertical: 'middle' }
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFEF4444' },
      }
      cell.border = {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' },
      }
    })
    headerRow.height = 24

    // Group rows by category for picking ergonomics
    const grouped = new Map<string, typeof order.items>()
    for (const item of order.items) {
      const key = item.product?.category?.name ?? '—'
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push(item)
    }
    const categoryNames = Array.from(grouped.keys()).sort()

    let rowIdx = 6
    let totalAgorot = 0
    for (const catName of categoryNames) {
      for (const item of grouped.get(catName)!) {
        const row = ws.getRow(rowIdx)
        row.getCell(1).value = catName
        row.getCell(2).value = item.productName
        row.getCell(3).value = item.productBarcode
        row.getCell(4).value = item.qtyOrdered
        row.getCell(5).value = item.qtySupplied ?? ''
        row.getCell(6).value = item.priceAgorot / 100

        for (let c = 1; c <= 6; c++) {
          const cell = row.getCell(c)
          cell.alignment = { horizontal: c === 2 ? 'right' : 'center', vertical: 'middle' }
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          }
        }
        row.getCell(6).numFmt = '#,##0.00'

        // Highlight shortage rows
        if (item.qtySupplied !== null && item.qtySupplied < item.qtyOrdered) {
          for (let c = 1; c <= 6; c++) {
            row.getCell(c).fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFFEF3C7' },
            }
          }
        }

        totalAgorot += item.priceAgorot * item.qtyOrdered
        rowIdx++
      }
    }

    // Totals row
    const totalsRow = ws.getRow(rowIdx + 1)
    totalsRow.getCell(2).value = 'סה״כ'
    totalsRow.getCell(2).font = { bold: true, size: 12 }
    totalsRow.getCell(2).alignment = { horizontal: 'right' }
    totalsRow.getCell(6).value = totalAgorot / 100
    totalsRow.getCell(6).numFmt = '#,##0.00 "₪"'
    totalsRow.getCell(6).font = { bold: true, size: 12 }
    totalsRow.getCell(6).alignment = { horizontal: 'center' }

    // Column widths
    ws.getColumn(1).width = 18 // category
    ws.getColumn(2).width = 40 // product name
    ws.getColumn(3).width = 18 // barcode
    ws.getColumn(4).width = 14 // qty ordered
    ws.getColumn(5).width = 14 // qty supplied
    ws.getColumn(6).width = 16 // price

    const buffer = (await wb.xlsx.writeBuffer()) as unknown as Buffer
    const numberPart = order.number ? String(order.number) : 'draft'
    const filename = `order-${numberPart}.xlsx`
    return { buffer, filename }
  }
}
