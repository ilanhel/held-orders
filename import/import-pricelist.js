/* eslint-disable */
// One-off import of the ERP price-list Excel into the catalog.
//
//   Dry-run (no DB writes):   node import/import-pricelist.js
//   Apply to DB:              node import/import-pricelist.js --apply
//
// Behaviour (decided with the user):
//  - 821 products imported from import/מחירון-פריטים.xlsx
//  - Column 3 "פריט" => barcode (unique), Column 4 "שם פריט" => name,
//    Column 10 "מחיר נטו" (fallback col 7) => priceAgorot.
//  - All products go to placeholder category "לא משויך".
//  - Products in 0 ₪ are imported as-is.
//  - Products referenced by existing orders are HIDDEN (not deleted) to keep
//    order history; all other existing products are hard-deleted.
//  - Import is an upsert by barcode: existing barcode => updated + reactivated;
//    new barcode => created.

const path = require('path')
const ExcelJS = require('exceljs')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')
const FILE = path.join(__dirname, 'מחירון-פריטים.xlsx')
const PLACEHOLDER_CATEGORY = 'לא משויך'

function cellValue(cell) {
  let v = cell.value
  if (v && typeof v === 'object' && 'result' in v) v = v.result
  if (v && typeof v === 'object' && 'text' in v) v = v.text
  return v
}

async function parseRows() {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(FILE)
  const ws = wb.worksheets[0]
  const rows = []
  for (let r = 3; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const item = cellValue(row.getCell(3))
    const name = cellValue(row.getCell(4))
    const unit = cellValue(row.getCell(7))
    const net = cellValue(row.getCell(10))
    if (item == null && name == null) continue
    const priceSrc = net != null && net !== '' ? net : unit
    const priceNum = Number(priceSrc)
    rows.push({
      barcode: String(item).trim(),
      name: String(name).trim(),
      priceAgorot: Number.isFinite(priceNum) ? Math.round(priceNum * 100) : 0,
    })
  }
  return rows
}

async function main() {
  const rows = await parseRows()

  // Validation
  const errors = []
  const seen = new Set()
  for (const [i, r] of rows.entries()) {
    if (!r.barcode) errors.push(`row ${i + 3}: missing barcode`)
    if (!r.name) errors.push(`row ${i + 3}: missing name`)
    if (seen.has(r.barcode)) errors.push(`row ${i + 3}: duplicate barcode ${r.barcode}`)
    seen.add(r.barcode)
    if (!Number.isInteger(r.priceAgorot) || r.priceAgorot < 0)
      errors.push(`row ${i + 3}: bad price ${r.priceAgorot}`)
  }

  console.log('=== PARSE SUMMARY ===')
  console.log('rows parsed:', rows.length)
  console.log('validation errors:', errors.length)
  errors.slice(0, 20).forEach((e) => console.log('  -', e))
  console.log('zero-price rows:', rows.filter((r) => r.priceAgorot === 0).length)
  console.log('sample (first 3):', JSON.stringify(rows.slice(0, 3)))
  console.log('sample (last 3):', JSON.stringify(rows.slice(-3)))

  if (errors.length) {
    console.error('\nAborting: fix validation errors first.')
    process.exit(1)
  }

  // Inspect current DB state
  const referencedIds = [
    ...new Set((await prisma.orderItem.findMany({ select: { productId: true } })).map((i) => i.productId)),
  ]
  const totalProducts = await prisma.product.count()
  console.log('\n=== DB STATE (current) ===')
  console.log('existing products:', totalProducts)
  console.log('products referenced by orders (will be HIDDEN):', referencedIds.length)
  console.log('products to hard-delete:', totalProducts - referencedIds.length)

  if (!APPLY) {
    console.log('\nDRY RUN — no changes written. Re-run with --apply to execute.')
    await prisma.$disconnect()
    return
  }

  console.log('\n=== APPLYING ===')

  // 1) Placeholder category
  const category = await prisma.category.upsert({
    where: { name: PLACEHOLDER_CATEGORY },
    update: {},
    create: { name: PLACEHOLDER_CATEGORY, sortOrder: 999 },
  })
  console.log('placeholder category id:', category.id)

  // 2) Hide products referenced by orders
  if (referencedIds.length) {
    const hidden = await prisma.product.updateMany({
      where: { id: { in: referencedIds } },
      data: { status: 'HIDDEN' },
    })
    console.log('hidden (in orders):', hidden.count)
  }

  // 3) Hard-delete every other product
  const deleted = await prisma.product.deleteMany({
    where: referencedIds.length ? { id: { notIn: referencedIds } } : {},
  })
  console.log('hard-deleted:', deleted.count)

  // 4) Upsert all rows by barcode
  let created = 0
  let updated = 0
  for (const r of rows) {
    const existing = await prisma.product.findUnique({ where: { barcode: r.barcode }, select: { id: true } })
    if (existing) {
      await prisma.product.update({
        where: { barcode: r.barcode },
        data: { name: r.name, priceAgorot: r.priceAgorot, categoryId: category.id, status: 'ACTIVE' },
      })
      updated++
    } else {
      await prisma.product.create({
        data: {
          name: r.name,
          barcode: r.barcode,
          priceAgorot: r.priceAgorot,
          categoryId: category.id,
          status: 'ACTIVE',
        },
      })
      created++
    }
  }
  console.log('created:', created, '| updated:', updated)

  // 5) Final verification
  const finalTotal = await prisma.product.count()
  const active = await prisma.product.count({ where: { status: 'ACTIVE' } })
  const hidden = await prisma.product.count({ where: { status: 'HIDDEN' } })
  const inPlaceholder = await prisma.product.count({ where: { categoryId: category.id } })
  console.log('\n=== FINAL STATE ===')
  console.log('total products:', finalTotal)
  console.log('active:', active, '| hidden:', hidden)
  console.log('in placeholder category:', inPlaceholder)

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
