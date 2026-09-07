/**
 * frame-size-groups-2026-09-07.js
 *
 * Restructure the 45 canonical plain frames (groups מסגרת לבנה / מסגרת שחורה /
 * מסגרת עץ) from color-based groups to SIZE-based groups:
 *   - name:      "מסגרת לבנה גודל 10x15"  ->  "מסגרת 10x15 לבנה"
 *   - groupName: "מסגרת לבנה"            ->  "מסגרת 10x15"
 *   - invoiceBarcode: white/black get the WOOD frame's barcode of that size
 *     (the size's single billing SKU); wood keeps its own barcode (null).
 *
 * Franchisee catalog then shows one card per size that opens color rows with
 * qty steppers. Run: set -a; source .env.local; set +a; node import/frame-size-groups-2026-09-07.js [--apply]
 */
const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const path = require('path')

const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

const COLOR_GROUPS = {
  'מסגרת לבנה': 'לבנה',
  'מסגרת שחורה': 'שחורה',
  'מסגרת עץ': 'עץ',
}

async function main() {
  const products = await prisma.product.findMany({
    where: { groupName: { in: Object.keys(COLOR_GROUPS) } },
    select: { id: true, name: true, barcode: true, groupName: true, invoiceBarcode: true, status: true },
  })
  console.log(`found ${products.length} products in color groups`)

  // Extract size from the name (e.g. "מסגרת לבנה גודל 10x15" -> "10x15")
  const sizeOf = (name) => {
    const m = name.match(/(\d+)\s*[xX*\/]\s*(\d+)/)
    return m ? `${m[1]}x${m[2]}` : null
  }

  // Wood barcode per size = the size's billing SKU
  const woodBySize = new Map()
  for (const p of products) {
    if (p.groupName === 'מסגרת עץ') {
      const size = sizeOf(p.name)
      if (size) woodBySize.set(size, p.barcode)
    }
  }
  console.log(`wood sizes: ${woodBySize.size}`)

  const changes = []
  for (const p of products) {
    const color = COLOR_GROUPS[p.groupName]
    const size = sizeOf(p.name)
    if (!size) {
      console.log(`!! NO SIZE in name, skipping: ${p.name}`)
      continue
    }
    const woodBarcode = woodBySize.get(size)
    if (!woodBarcode) {
      console.log(`!! NO WOOD frame for size ${size} (${p.name}) — skipping invoiceBarcode`)
    }
    const newName = `מסגרת ${size} ${color}`
    const newGroup = `מסגרת ${size}`
    // Wood keeps its own barcode as the billing SKU (invoiceBarcode null);
    // white/black bill under the wood barcode.
    const newInvoiceBarcode = color === 'עץ' ? null : woodBarcode ?? null
    changes.push({
      id: p.id,
      barcode: p.barcode,
      status: p.status,
      prev: { name: p.name, groupName: p.groupName, invoiceBarcode: p.invoiceBarcode },
      next: { name: newName, groupName: newGroup, invoiceBarcode: newInvoiceBarcode },
    })
  }

  for (const c of changes) {
    console.log(
      `${c.status.padEnd(6)} ${c.barcode.padEnd(14)} "${c.prev.name}" -> "${c.next.name}" | grp "${c.next.groupName}" | invoice ${c.next.invoiceBarcode ?? '(own)'}`
    )
  }
  console.log(`total: ${changes.length} changes`)

  if (!APPLY) {
    console.log('\nDRY RUN — re-run with --apply to write')
    return
  }

  const backupFile = path.join(
    __dirname,
    `frame-size-groups-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  )
  fs.writeFileSync(backupFile, JSON.stringify(changes, null, 2))
  console.log(`backup written: ${backupFile}`)

  for (const c of changes) {
    await prisma.product.update({
      where: { id: c.id },
      data: c.next,
    })
  }
  console.log('APPLIED.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
