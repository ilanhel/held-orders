// One-off: set REAL ERP SKUs on wood frames (user list, 2026-08-30).
// Decisions: 7291027110152 is WOOD 10x15 (black 10x15 gets invented 60041);
// wood 30x40 has TWO real SKUs (7291027130402 primary + 7291027113040 alias, even
// per-store split; the alias row currently on the black 30x40 keeper is removed);
// old wood barcodes RETIRED (deactivated) — only real SKUs appear in picking/XLSX.
// Run: set -a; source .env.local; set +a; node import/wood-frame-skus-2026-08-30.js [--apply]

const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')
const log = (...a) => console.log(APPLY ? '[APPLY]' : '[DRY]', ...a)

// oldBarcode → newBarcode (wood frames). extraAliases: additional real SKUs.
const SWAPS = [
  { size: '13x18', old: '7291027074614', neu: '7291027113184' },
  { size: '15x15', old: '60024', neu: '7291027115157' },
  { size: '15x21', old: '7291027077196', neu: '7291027115218' },
  { size: '18x24', old: '60025', neu: '7291027118240' },
  { size: '20x20', old: '60026', neu: '7291027120205' },
  { size: '20x30', old: '7291027072047', neu: '7291027120304' },
  { size: '21x30', old: '7291027074652', neu: '7291027121301' },
  { size: '30x30', old: '60029', neu: '7291027074706' },
  { size: '30x40', old: '7291027074676', neu: '7291027130402', extraAliases: ['7291027113040'] },
  // 10x15 handled separately (barcode moves from the black 10x15 product)
]
const BLACK_10X15_OLD = '7291027110152' // currently on מסגרת שחורה גודל 10x15
const BLACK_10X15_NEW = '60041' // invented — no real SKU given for black frames yet
const WOOD_10X15 = '7291027077172' // current wood 10x15 primary

async function getP(barcode) {
  const p = await prisma.product.findUnique({ where: { barcode }, include: { barcodeAliases: true } })
  if (!p) throw new Error(`product not found: ${barcode}`)
  return p
}

async function main() {
  // free new barcodes held by HIDDEN 0-order products (e.g. מסגרת סורנטו 18x24 —
  // same physical frame under a supplier model name)
  for (const b of [...SWAPS.map((s) => s.neu), BLACK_10X15_NEW]) {
    const holder = await prisma.product.findUnique({
      where: { barcode: b },
      include: { _count: { select: { orderItems: true } } },
    })
    if (holder) {
      if (holder.status !== 'HIDDEN' || holder._count.orderItems > 0) {
        throw new Error(`new barcode held by non-deletable product: ${b} (${holder.name})`)
      }
      log(`DELETE  ${b} | ${holder.name} (hidden, 0 orders — frees the barcode)`)
      if (APPLY) await prisma.product.delete({ where: { id: holder.id } })
    }
    if (await prisma.productBarcodeAlias.findUnique({ where: { barcode: b } })) throw new Error(`new barcode already an alias: ${b}`)
  }

  const touched = [BLACK_10X15_OLD, WOOD_10X15, ...SWAPS.map((s) => s.old), '7291027076328']
  const before = await prisma.product.findMany({
    where: { barcode: { in: touched } },
    include: { barcodeAliases: true },
  })
  if (APPLY) {
    const file = `import/wood-frame-skus-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    fs.writeFileSync(file, JSON.stringify(before, null, 2))
    console.log('backup →', file)
  }
  const touchedIds = []

  // 1) free 7291027110152: black 10x15 → invented 60041
  const black = await getP(BLACK_10X15_OLD)
  touchedIds.push(black.id)
  log(`SWAP    ${black.name}: ${BLACK_10X15_OLD} → ${BLACK_10X15_NEW}`)
  if (APPLY) await prisma.product.update({ where: { id: black.id }, data: { barcode: BLACK_10X15_NEW } })

  // 2) wood 10x15 takes it
  const wood1015 = await getP(WOOD_10X15)
  touchedIds.push(wood1015.id)
  log(`SWAP    ${wood1015.name}: ${WOOD_10X15} → ${BLACK_10X15_OLD}`)
  if (APPLY) await prisma.product.update({ where: { id: wood1015.id }, data: { barcode: BLACK_10X15_OLD } })
  for (const a of wood1015.barcodeAliases.filter((a) => a.active)) {
    log(`ALIAS-OFF ${a.barcode} (${wood1015.name})`)
    if (APPLY) await prisma.productBarcodeAlias.update({ where: { id: a.id }, data: { active: false } })
  }
  log(`ALIAS-ON ${BLACK_10X15_OLD} → ${wood1015.name}`)
  if (APPLY) await prisma.productBarcodeAlias.create({ data: { productId: wood1015.id, barcode: BLACK_10X15_OLD, active: true } })

  // 3) the 113040 alias row currently points at the BLACK 30x40 keeper — remove it
  const alias113040 = await prisma.productBarcodeAlias.findUnique({ where: { barcode: '7291027113040' } })
  if (alias113040) {
    log('ALIAS-DEL 7291027113040 (from מסגרת שחורה 30x40)')
    if (APPLY) await prisma.productBarcodeAlias.delete({ where: { id: alias113040.id } })
  }
  const black3040 = await getP('7291027076328')
  touchedIds.push(black3040.id)
  for (const a of black3040.barcodeAliases.filter((a) => a.active && a.barcode !== '7291027113040')) {
    log(`ALIAS-OFF ${a.barcode} (${black3040.name})`)
    if (APPLY) await prisma.productBarcodeAlias.update({ where: { id: a.id }, data: { active: false } })
  }

  // 4) the rest of the wood swaps
  for (const s of SWAPS) {
    const p = await getP(s.old)
    touchedIds.push(p.id)
    log(`SWAP    ${p.name}: ${s.old} → ${s.neu}`)
    if (APPLY) await prisma.product.update({ where: { id: p.id }, data: { barcode: s.neu } })
    for (const a of p.barcodeAliases.filter((a) => a.active)) {
      log(`ALIAS-OFF ${a.barcode} (${p.name})`)
      if (APPLY) await prisma.productBarcodeAlias.update({ where: { id: a.id }, data: { active: false } })
    }
    const extras = s.extraAliases ?? []
    if (extras.length) {
      // multi-SKU product: register primary + extras as active aliases (per-store split)
      for (const b of [s.neu, ...extras]) {
        log(`ALIAS-ON ${b} → ${p.name}`)
        if (APPLY) await prisma.productBarcodeAlias.create({ data: { productId: p.id, barcode: b, active: true } })
      }
    } else if (p.barcodeAliases.length) {
      log(`ALIAS-ON ${s.neu} → ${p.name}`)
      if (APPLY) await prisma.productBarcodeAlias.create({ data: { productId: p.id, barcode: s.neu, active: true } })
    }
  }

  // 5) clear sticky per-store assignments for all touched products (fresh start)
  const del = await prisma.storeProductBarcode.findMany({ where: { productId: { in: touchedIds } } })
  log(`STICKY-CLEAR ${del.length} store assignments`)
  if (APPLY) await prisma.storeProductBarcode.deleteMany({ where: { productId: { in: touchedIds } } })

  console.log(APPLY ? 'DONE.' : 'Dry-run only. Re-run with --apply.')
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
