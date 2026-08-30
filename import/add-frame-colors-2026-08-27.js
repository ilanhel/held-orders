// One-off: fill missing color variants (לבן/צבע עץ/שחורה) for frame sizes.
// Same logic as the מסגרת <size> products: invented 600xx SKUs, price 0, category מסגרות.
// Dry-run by default; pass --apply to write. Direct prisma — no notifications.
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const CREATES = [
  // [barcode, name, groupName]
  ['60024', 'מסגרת צבע עץ גודל 15X15', 'מסגרת צבע עץ'],
  ['60025', 'מסגרת צבע עץ גודל 18X24', 'מסגרת צבע עץ'],
  ['60026', 'מסגרת צבע עץ גודל 20X20', 'מסגרת צבע עץ'],
  ['60027', 'מסגרת צבע עץ גודל 20X30', 'מסגרת צבע עץ'],
  ['60028', 'מסגרת צבע עץ גודל 21X30', 'מסגרת צבע עץ'],
  ['60029', 'מסגרת צבע עץ גודל 30X30', 'מסגרת צבע עץ'],
  ['60030', 'מסגרת צבע עץ גודל 40X60', 'מסגרת צבע עץ'],
  ['60031', 'מסגרת צבע עץ גודל 50X70', 'מסגרת צבע עץ'],
  ['60032', 'מסגרת צבע לבן גודל 40X60', 'מסגרת צבע לבן'],
  ['60033', 'מסגרת צבע לבן גודל 50X70', 'מסגרת צבע לבן'],
  ['60034', 'מסגרת שחורה גודל 18X24', 'מסגרת שחורה'],
  ['60035', 'מסגרת שחורה גודל 50X70', 'מסגרת שחורה'],
]

// Existing hidden white 18X24 — reactivate instead of duplicating.
const UNHIDE_BARCODE = '7291027076427'

async function main() {
  const apply = process.argv.includes('--apply')

  const category = await prisma.category.findFirst({ where: { name: 'מסגרות' } })
  if (!category) throw new Error('Category מסגרות not found')

  // Safety: verify invented barcodes are free (products + aliases).
  const codes = CREATES.map((c) => c[0])
  const [prodClash, aliasClash] = await Promise.all([
    prisma.product.findMany({ where: { barcode: { in: codes } }, select: { barcode: true, name: true } }),
    prisma.productBarcodeAlias.findMany({ where: { barcode: { in: codes } }, select: { barcode: true } }),
  ])
  if (prodClash.length || aliasClash.length) {
    console.error('BARCODE CLASH:', prodClash, aliasClash)
    process.exit(1)
  }

  const hidden = await prisma.product.findUnique({ where: { barcode: UNHIDE_BARCODE } })
  if (!hidden) throw new Error('Hidden white 18X24 not found')

  console.log(apply ? 'APPLYING:' : 'DRY RUN (pass --apply to write):')
  for (const [barcode, name, groupName] of CREATES) {
    console.log(`CREATE  ${barcode} | ${name} | group=${groupName}`)
    if (apply) {
      await prisma.product.create({
        data: { name, barcode, categoryId: category.id, priceAgorot: 0, groupName, status: 'ACTIVE' },
      })
    }
  }

  console.log(`UNHIDE  ${hidden.barcode} | ${hidden.name} (${hidden.status} → ACTIVE, group → מסגרת צבע לבן)`)
  if (apply) {
    await prisma.product.update({
      where: { id: hidden.id },
      data: { status: 'ACTIVE', groupName: 'מסגרת צבע לבן' },
    })
  }

  console.log(apply ? 'Done.' : 'Dry run complete.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
