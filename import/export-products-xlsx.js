/**
 * export-products-xlsx.js — checklist Excel for bulk image upload.
 * Lists all non-hidden products ordered by category: category, name, barcode,
 * has-image. The user prepares image files named "<barcode>.jpg" (or
 * png/webp) in import/images/, then runs upload-images.js.
 *
 * Run: set -a; source .env.local; set +a; node import/export-products-xlsx.js
 */
const { PrismaClient } = require('@prisma/client')
const ExcelJS = require('exceljs')
const path = require('path')

const prisma = new PrismaClient()

async function main() {
  const products = await prisma.product.findMany({
    where: { status: { not: 'HIDDEN' } },
    include: { category: { select: { name: true, sortOrder: true } } },
    orderBy: [{ category: { sortOrder: 'asc' } }, { name: 'asc' }],
  })

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('מוצרים', { views: [{ rightToLeft: true }] })
  ws.columns = [
    { header: 'קטגוריה', key: 'category', width: 20 },
    { header: 'שם המוצר', key: 'name', width: 45 },
    { header: 'ברקוד (= שם קובץ התמונה)', key: 'barcode', width: 26 },
    { header: 'יש תמונה?', key: 'hasImage', width: 12 },
  ]
  ws.getRow(1).font = { bold: true }

  for (const p of products) {
    const row = ws.addRow({
      category: p.category.name,
      name: p.name,
      barcode: p.barcode,
      hasImage: p.imagePath ? '✓' : '',
    })
    // Barcode must stay text (Excel would mangle long numbers)
    row.getCell('barcode').numFmt = '@'
    if (!p.imagePath) {
      row.getCell('hasImage').fill = {
        type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE0E0' },
      }
    }
  }

  const file = path.join(__dirname, 'products-images-checklist.xlsx')
  await wb.xlsx.writeFile(file)
  console.log(`written: ${file} (${products.length} products)`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
