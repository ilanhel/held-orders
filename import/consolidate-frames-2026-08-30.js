// One-off: consolidate plain frames (מסגרת + גודל + צבע only) into ONE product
// per size+color, with all real barcodes as ProductBarcodeAlias (sticky per-store
// picking assignment via resolveStoreBarcode). Decisions (user, 2026-08-30):
//   - "מסגרת עץ" + "מסגרת צבע עץ" are the SAME product (עץ טבעי) — merged.
//   - Generic no-color "מסגרת <size>" products (60020 etc.) — HIDDEN.
//   - 10X10 לבנה + 20X25 שחור (not on the list) — left ACTIVE, untouched.
//   - Missing combos created (invented SKUs 60036-60040, price 0), עץ 40X50 unhidden.
//   - Invented-SKU duplicates (60027/60028/60030) NOT aliased (no physical barcode);
//     deleted when 0 orders, hidden otherwise. Real-barcode duplicates are aliased
//     to the keeper, then hidden (with orders) or deleted (0 orders).
// Keepers renamed to canonical "מסגרת <צבע> גודל <WXH>", groups:
//   מסגרת לבנה / מסגרת שחורה / מסגרת עץ.
// Run: set -a; source .env.local; set +a; node import/consolidate-frames-2026-08-30.js [--apply]

const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

const GROUPS = { white: 'מסגרת לבנה', black: 'מסגרת שחורה', wood: 'מסגרת עץ' }
const canonical = (color, size) => `${GROUPS[color]} גודל ${size}`

// keep: primary barcode of the surviving product
// aliasHide: real-barcode duplicates → alias to keeper + HIDDEN (they have orders)
// aliasDelete: real-barcode duplicates → alias to keeper + hard-deleted (0 orders)
// plainDelete / plainHide: invented-SKU duplicates (no alias registered)
// imageFrom: copy imagePath to keeper from this barcode (keeper has none)
const PLAN = [
  // ---- white ----
  { color: 'white', size: '10X15', keep: '7460', aliasDelete: ['7291027600011'], aliasHide: ['7291027076267'] },
  { color: 'white', size: '13X18', keep: '7291027600028' },
  { color: 'white', size: '15X15', keep: '7291027600219' },
  { color: 'white', size: '15X21', keep: '7291027074621' },
  { color: 'white', size: '18X24', keep: '7291027076427' },
  { color: 'white', size: '20X20', keep: '7291027600226' },
  { color: 'white', size: '20X30', keep: '7291027076304' },
  { color: 'white', size: '21X30', keep: '7291027076311' },
  { color: 'white', size: '30X30', keep: '7291027077790' },
  { color: 'white', size: '30X40', keep: '7291027600097' },
  { color: 'white', size: '30X45', keep: '7291027076335' },
  { color: 'white', size: '40X50', create: '60037' },
  { color: 'white', size: '40X60', keep: '60032' },
  { color: 'white', size: '50X50', create: '60039' },
  { color: 'white', size: '50X70', keep: '60033' },
  // ---- black ----
  { color: 'black', size: '10X15', keep: '7291027110152' },
  { color: 'black', size: '13X18', keep: '7291027076274' },
  { color: 'black', size: '15X15', keep: '7291027077684' },
  { color: 'black', size: '15X21', keep: '7291027600035' },
  { color: 'black', size: '18X24', keep: '60034', aliasDelete: ['7291027600042'], imageFrom: '7291027600042' },
  { color: 'black', size: '20X20', keep: '7291027077691' },
  { color: 'black', size: '20X30', keep: '7291027600066' },
  { color: 'black', size: '21X30', keep: '7291027077226' },
  { color: 'black', size: '30X30', keep: '7291027600233' },
  { color: 'black', size: '30X40', keep: '7291027076328', aliasHide: ['7291027113040'] },
  { color: 'black', size: '30X45', keep: '7291027077240' },
  { color: 'black', size: '40X50', create: '60036' },
  { color: 'black', size: '40X60', keep: '7291027075291' },
  { color: 'black', size: '50X50', create: '60038' },
  { color: 'black', size: '50X70', keep: '60035' },
  // ---- wood (עץ + צבע עץ merged) ----
  { color: 'wood', size: '10X15', keep: '7291027077172', aliasDelete: ['7291027074607'] },
  { color: 'wood', size: '13X18', keep: '7291027074614' },
  { color: 'wood', size: '15X15', keep: '60024' },
  { color: 'wood', size: '15X21', keep: '7291027077196', aliasHide: ['7291027072023'] },
  { color: 'wood', size: '18X24', keep: '60025' },
  { color: 'wood', size: '20X20', keep: '60026' },
  { color: 'wood', size: '20X30', keep: '7291027072047', plainDelete: ['60027'] },
  { color: 'wood', size: '21X30', keep: '7291027074652', aliasHide: ['7291027072054'], plainHide: ['60028'] },
  { color: 'wood', size: '25X35', create: '60040' },
  { color: 'wood', size: '30X30', keep: '60029' },
  { color: 'wood', size: '30X40', keep: '7291027074676' },
  { color: 'wood', size: '30X45', keep: '7291027074683' },
  { color: 'wood', size: '40X50', keep: '7291027074744', unhide: true },
  { color: 'wood', size: '40X60', keep: '7291027074720', plainDelete: ['60030'] },
  { color: 'wood', size: '50X70', keep: '7291027074737' },
]

// Generic no-color "מסגרת <size>" products → HIDDEN (barcodes stay on them, unused).
const HIDE_GENERIC = ['60020', '60021', '60004', '7769', '60006', '62130', '60023', '60009', '7633', '7570', '7647']

async function main() {
  const allBarcodes = new Set()
  for (const r of PLAN) {
    for (const b of [r.keep, r.create, r.imageFrom, ...(r.aliasHide || []), ...(r.aliasDelete || []), ...(r.plainHide || []), ...(r.plainDelete || [])]) {
      if (b) allBarcodes.add(b)
    }
  }
  for (const b of HIDE_GENERIC) allBarcodes.add(b)

  const products = await prisma.product.findMany({
    where: { barcode: { in: [...allBarcodes] } },
    include: { _count: { select: { orderItems: true } } },
  })
  const byBarcode = Object.fromEntries(products.map((p) => [p.barcode, p]))

  // sanity: every referenced barcode exists (except the ones we create)
  for (const b of allBarcodes) {
    const isCreate = PLAN.some((r) => r.create === b)
    if (!isCreate && !byBarcode[b]) throw new Error(`barcode not found in DB: ${b}`)
    if (isCreate && byBarcode[b]) throw new Error(`create barcode already exists: ${b}`)
  }
  const aliasClash = await prisma.productBarcodeAlias.findMany({
    where: { barcode: { in: PLAN.map((r) => r.create).filter(Boolean) } },
  })
  if (aliasClash.length) throw new Error(`create barcode already used as alias: ${aliasClash.map((a) => a.barcode).join(',')}`)

  const cat = await prisma.category.findFirst({ where: { name: 'מסגרות' } })
  if (!cat) throw new Error('category מסגרות not found')

  // backup
  const backup = products.map((p) => ({ id: p.id, barcode: p.barcode, name: p.name, status: p.status, groupName: p.groupName, imagePath: p.imagePath }))
  if (APPLY) {
    const file = `import/consolidate-frames-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    fs.writeFileSync(file, JSON.stringify(backup, null, 2))
    console.log('backup →', file)
  }

  const log = (...a) => console.log(APPLY ? '[APPLY]' : '[DRY]', ...a)

  for (const r of PLAN) {
    const name = canonical(r.color, r.size)
    const group = GROUPS[r.color]

    if (r.create) {
      log(`CREATE  ${r.create} | ${name}`)
      if (APPLY) {
        await prisma.product.create({
          data: { barcode: r.create, name, groupName: group, categoryId: cat.id, priceAgorot: 0, status: 'ACTIVE' },
        })
      }
      continue
    }

    const keeper = byBarcode[r.keep]
    const dups = [...(r.aliasHide || []), ...(r.aliasDelete || [])]

    // register aliases: keeper primary first (like CatalogService.addBarcode), then dup barcodes
    if (dups.length) {
      const existing = await prisma.productBarcodeAlias.findMany({ where: { productId: keeper.id } })
      const have = new Set(existing.map((a) => a.barcode))
      for (const b of [r.keep, ...dups]) {
        if (have.has(b)) continue
        log(`ALIAS   ${b} → ${name} (${r.keep})`)
        if (APPLY) await prisma.productBarcodeAlias.create({ data: { productId: keeper.id, barcode: b, active: true } })
      }
    }

    // image inheritance
    if (r.imageFrom && !keeper.imagePath) {
      const src = byBarcode[r.imageFrom]
      if (src?.imagePath) {
        log(`IMAGE   ${r.imageFrom} → ${r.keep}`)
        if (APPLY) await prisma.product.update({ where: { id: keeper.id }, data: { imagePath: src.imagePath } })
      }
    }

    // retire duplicates
    for (const b of [...(r.aliasHide || []), ...(r.plainHide || [])]) {
      const p = byBarcode[b]
      log(`HIDE    ${b} | ${p.name} (orders:${p._count.orderItems})`)
      if (APPLY) await prisma.product.update({ where: { id: p.id }, data: { status: 'HIDDEN', groupName: null } })
    }
    for (const b of [...(r.aliasDelete || []), ...(r.plainDelete || [])]) {
      const p = byBarcode[b]
      if (p._count.orderItems > 0) throw new Error(`refusing to delete ${b} — has ${p._count.orderItems} orderItems`)
      log(`DELETE  ${b} | ${p.name}`)
      if (APPLY) await prisma.product.delete({ where: { id: p.id } })
    }

    // canonical rename + group + unhide
    const data = {}
    if (keeper.name !== name) data.name = name
    if (keeper.groupName !== group) data.groupName = group
    if (r.unhide && keeper.status !== 'ACTIVE') data.status = 'ACTIVE'
    if (Object.keys(data).length) {
      log(`UPDATE  ${r.keep} | "${keeper.name}" → "${name}" ${r.unhide ? '(+ACTIVE)' : ''}`)
      if (APPLY) await prisma.product.update({ where: { id: keeper.id }, data })
    }
  }

  for (const b of HIDE_GENERIC) {
    const p = byBarcode[b]
    if (p.status === 'HIDDEN') continue
    log(`HIDE-GENERIC ${b} | ${p.name}`)
    if (APPLY) await prisma.product.update({ where: { id: p.id }, data: { status: 'HIDDEN' } })
  }

  console.log(APPLY ? 'DONE.' : 'Dry-run only. Re-run with --apply.')
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
