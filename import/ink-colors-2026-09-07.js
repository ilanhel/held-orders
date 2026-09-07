/**
 * ink-colors-2026-09-07.js
 *
 * Ink types become variant color groups (like plain frames): for each of the
 * 5 ink types, create 6 color products (שחור/מגנטה/סיאן/ילו/לייט בלו/בלו) that
 * all bill under the type's original barcode (invoiceBarcode), then HIDE the
 * original colorless product. Franchisees order by color only.
 *
 * Also: wood frame 25x35 (60040) gets invoiceBarcode = own barcode so the
 * "מסגרת 25x35" group (wood-only) appears in the admin variant-color tool.
 *
 * Run: set -a; source .env.local; set +a; node import/ink-colors-2026-09-07.js [--apply]
 */
const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const path = require('path')

const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

const COLORS = ['שחור', 'מגנטה', 'סיאן', 'ילו', 'לייט בלו', 'בלו']

// sourceBarcode: the existing colorless product (hidden after) whose barcode
// becomes the group's billing SKU. groupName: the new group + product prefix.
const TYPES = [
  { sourceBarcode: '857122883350', groupName: 'דיו SAWGRASS SG500/1000' },
  { sourceBarcode: '857122883351', groupName: 'דיו SAWGRASS SG 800' },
  { sourceBarcode: '857122883314', groupName: 'דיו RICOH' },
  { sourceBarcode: '4141', groupName: 'דיו סובלימציה אפסון מקורי' },
  { sourceBarcode: '10343917477', groupName: 'דיו EPSON פלוטר P6000/9000' },
]

async function nextInventedBarcode(start) {
  for (let n = start; n < 70000; n++) {
    const code = String(n)
    const taken =
      (await prisma.product.findUnique({ where: { barcode: code }, select: { id: true } })) ||
      (await prisma.productBarcodeAlias.findUnique({ where: { barcode: code }, select: { id: true } }))
    if (!taken) return n
  }
  throw new Error('NO_FREE_BARCODE')
}

async function main() {
  const backup = []
  let nextCode = 60056

  for (const type of TYPES) {
    const source = await prisma.product.findUnique({
      where: { barcode: type.sourceBarcode },
      select: { id: true, name: true, status: true, categoryId: true, groupName: true },
    })
    if (!source) {
      console.log(`!! source not found: ${type.sourceBarcode} — skipping type`)
      continue
    }
    console.log(`\n== ${type.groupName} (billing ${type.sourceBarcode}, source "${source.name}")`)

    for (const color of COLORS) {
      const name = `${type.groupName} ${color}`
      const exists = await prisma.product.findFirst({ where: { name }, select: { id: true } })
      if (exists) {
        console.log(`   exists, skip: ${name}`)
        continue
      }
      nextCode = await nextInventedBarcode(nextCode)
      const barcode = String(nextCode)
      nextCode++
      console.log(`   create: ${name} | barcode ${barcode} | invoice ${type.sourceBarcode}`)
      if (APPLY) {
        await prisma.product.create({
          data: {
            name,
            barcode,
            categoryId: source.categoryId,
            priceAgorot: 0,
            status: 'ACTIVE',
            groupName: type.groupName,
            invoiceBarcode: type.sourceBarcode,
          },
        })
      }
    }

    if (source.status !== 'HIDDEN') {
      console.log(`   hide source: "${source.name}"`)
      backup.push({ id: source.id, barcode: type.sourceBarcode, prevStatus: source.status, prevGroupName: source.groupName })
      if (APPLY) {
        await prisma.product.update({ where: { id: source.id }, data: { status: 'HIDDEN' } })
      }
    }
  }

  // Wood 25x35: expose its group in the variant tool
  const wood2535 = await prisma.product.findUnique({ where: { barcode: '60040' }, select: { id: true, name: true, invoiceBarcode: true } })
  if (wood2535 && !wood2535.invoiceBarcode) {
    console.log(`\nset invoiceBarcode=60040 on "${wood2535.name}"`)
    if (APPLY) {
      await prisma.product.update({ where: { id: wood2535.id }, data: { invoiceBarcode: '60040' } })
    }
  }

  if (!APPLY) {
    console.log('\nDRY RUN — re-run with --apply to write')
    return
  }
  const backupFile = path.join(
    __dirname,
    `ink-colors-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  )
  fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2))
  console.log(`\nAPPLIED. backup: ${backupFile}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
