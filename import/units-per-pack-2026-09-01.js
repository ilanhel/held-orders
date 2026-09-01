// Set Product.unitsPerPack for pack-based products (invoice/ERP quantities
// are converted to individual units). Also adds the ספל פלא order note.
//
// Usage:
//   set -a; source .env.local; set +a; node import/units-per-pack-2026-09-01.js          # dry-run
//   set -a; source .env.local; set +a; node import/units-per-pack-2026-09-01.js --apply
const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const path = require('path')

const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

const KEYCHAIN_NOTE = 'כל יחידה בהזמנה = חבילה של 10 יחידות'
const MAGIC_MUG_NOTE = 'הזמנה במגשים של 12 יחידות'

async function main() {
  // rule → list of { where, units } — resolved to concrete products first.
  const targets = new Map() // productId → { product, units, reason }

  function add(products, units, reason) {
    for (const p of products) {
      const prev = targets.get(p.id)
      if (prev && prev.units !== units) {
        throw new Error(`CONFLICT ${p.barcode} ${p.name}: ${prev.units} vs ${units}`)
      }
      targets.set(p.id, { product: p, units, reason })
    }
  }

  // Shirts — packs of 5
  add(
    await prisma.product.findMany({
      where: { groupName: { in: ['חולצת סובלימציה ילדים', 'חולצת סובלימציה מבוגר'] } },
    }),
    5,
    'חולצות'
  )
  // Sublimation paper — 100 sheets per pack
  add(
    await prisma.product.findMany({
      where: { barcode: { in: ['857122883300', '857122883343'] } },
    }),
    100,
    'נייר סובלימציה'
  )
  // Magnets — 100 per box
  add(
    await prisma.product.findMany({
      where: { barcode: { in: ['857122883301', '857122883302', '857122883303'] } },
    }),
    100,
    'מגנטים'
  )
  // White mug — box of 36
  add(await prisma.product.findMany({ where: { barcode: '8500' } }), 36, 'ספל לבן')
  // Colored mugs — tray of 12
  add(
    await prisma.product.findMany({
      where: { groupName: 'ספל לבן פנים וידית בצבע' },
    }),
    12,
    'ספלים צבעוניים'
  )
  // Magic mug — 12 per pack
  add(await prisma.product.findMany({ where: { barcode: '8503' } }), 12, 'ספל פלא')
  // Keychains + laundry bag — pack of 10 (identified by their shared order note)
  add(
    await prisma.product.findMany({ where: { orderNote: KEYCHAIN_NOTE } }),
    10,
    'חבילה של 10'
  )

  const rows = [...targets.values()].sort((a, b) =>
    a.product.name.localeCompare(b.product.name, 'he')
  )
  console.log(`${APPLY ? 'APPLY' : 'DRY-RUN'} — ${rows.length} products:\n`)
  const byReason = {}
  for (const { product, units, reason } of rows) {
    byReason[reason] = (byReason[reason] || 0) + 1
    const change = product.unitsPerPack === units ? '(already set)' : `${product.unitsPerPack} → ${units}`
    console.log(`  ×${String(units).padStart(3)}  ${product.barcode}  ${product.name}  ${change}`)
  }
  console.log('\nSummary:', byReason)

  const magicMug = await prisma.product.findUnique({ where: { barcode: '8503' } })
  console.log(`\nספל פלא orderNote: "${magicMug?.orderNote ?? ''}" → "${MAGIC_MUG_NOTE}"`)

  if (!APPLY) {
    console.log('\nDry-run only. Re-run with --apply to write.')
    return
  }

  // Backup previous values
  const backup = rows.map(({ product }) => ({
    id: product.id,
    barcode: product.barcode,
    name: product.name,
    prevUnitsPerPack: product.unitsPerPack,
    prevOrderNote: product.orderNote,
  }))
  const backupPath = path.join(
    __dirname,
    `units-per-pack-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  )
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2))
  console.log(`\nBackup written: ${backupPath}`)

  for (const { product, units } of rows) {
    await prisma.product.update({ where: { id: product.id }, data: { unitsPerPack: units } })
  }
  await prisma.product.update({
    where: { barcode: '8503' },
    data: { orderNote: MAGIC_MUG_NOTE },
  })
  console.log('Done.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
