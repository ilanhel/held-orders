/**
 * inventory-apply-2026-09-15.js — apply the approved inventory reconciliation.
 * Dry-run by default; --apply writes (with JSON backup of every touched row).
 *
 * Approved plan (user answers 2026-09-15):
 * - Frames: ONE billing SKU per size (all colors bill under it via
 *   invoiceBarcode; internal codes stay product identity only).
 * - 30x45 exception: existing לבנה/שחורה/עץ keep billing 7291027074683; new
 *   אפור/זהב/כסף bill under 7291027072085 (user: keep both SKUs).
 * - 15x15: only עץ+שחורה (hide לבנה). 21x30: only עץ+לבנה (hide שחורה).
 * - Cancelled: 29.7x42, 25x35 (leave as-is), עץ עבה, 10x15 זהב (that barcode
 *   is pewter gold), 15x21 זהב (per answer: colors are שחור/לבן/עץ/אפור).
 * - DELETE from system: size groups 40x50 + 50x50 (hide if order history).
 * - Albums: create 11, reactivate 3, hide 12.
 * - Pewter: reactivate hidden counted items, create 6 new, pewter 20/30 כסף
 *   (60054) bills under 729102746205, pewter 20/30 זהב (60055) hidden.
 *   Decorated/invented pewter actives LEFT AS-IS (user: don't touch מעוצבות).
 * - Stock: stockQty = counted − ordered-since-count (submitted >= 13/09 21:00Z,
 *   not cancelled), floor 0.
 */
const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const path = require('path')

const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')
const COUNT_CUTOFF = new Date('2026-09-13T21:00:00Z') // count was 14/09 IL

// ---- frames: size groups. colors: [name, countedQty]. main = billing SKU.
const FRAME_GROUPS = [
  { size: '10x15', main: '7291027074607', colors: [['לבנה', 41], ['עץ', 72], ['שחורה', 112]] }, // שחור מאוחד (72+40)
  { size: '13x18', main: '7291027074614', colors: [['לבנה', 178], ['עץ', 171], ['שחורה', 96], ['עץ כהה', 24], ['חום', 31], ['אפור', 4], ['כסוף', 15], ['זהב', 43], ['ברונזה', 6]] },
  { size: '15x21', main: '7291027074621', colors: [['לבנה', 49], ['עץ', 144], ['שחורה', 94], ['אפור', 0]] }, // שחור מאוחד (22+72)
  { size: '15x15', main: '7291027600219', colors: [['עץ', 16], ['שחורה', 17]], hideOthers: ['לבנה'] },
  { size: '18x24', main: '7291027600042', colors: [['לבנה', 31], ['עץ', 39], ['שחורה', 47]] },
  { size: '20x20', main: '7291027600226', colors: [['עץ', 25], ['שחורה', 12], ['לבנה', 7], ['כסוף', 2], ['זהב', 8]] },
  { size: '20x30', main: '7291027074645', colors: [['לבנה', 51], ['עץ', 89], ['שחורה', 105], ['זהב', 9]] },
  { size: '21x30', main: '7291027074652', colors: [['עץ', 13], ['לבנה', 69]], hideOthers: ['שחורה'] },
  { size: '30x30', main: '7291027077790', colors: [['עץ', 18], ['שחורה', 57], ['זהב', 5], ['לבנה', 22]] },
  { size: '30x40', main: '7291027074676', colors: [['זהב', 28], ['כסף', 9], ['לבנה', 17], ['עץ', 37], ['שחורה', 14]] },
  { size: '40x60', main: '7291027076465', colors: [['עץ', 22], ['לבנה', 19], ['שחורה', 15]] },
  { size: '50x70', main: '7291027074737', colors: [['לבנה', 14], ['עץ', 20], ['שחורה', 1], ['כסף', 5]] },
  // new groups
  { size: '10x10', main: '7291027600202', colors: [['עץ', 7], ['שחורה', 20], ['כסוף', 21], ['ברונזה', 7], ['חום', 16], ['אפור', 20]], hideOthers: ['לבנה'] },
  { size: '21x29.7', main: '7291027600073', colors: [['עץ', 69], ['עץ כהה', 2]] },
]
// 30x45 special: existing three keep billing 74683; add three billing 72085
const G3045 = {
  size: '30x45',
  keep: [['לבנה', 24 + 13], ['עץ', 24 + 22], ['שחורה', 36 + 8]], // counts from both lists summed
  add: { main: '7291027072085', colors: [['אפור', 4], ['זהב', 11], ['כסף', 6]] },
}
// singles / special groups (first color carries the real barcode)
const SPECIALS = [
  { group: 'מסגרת תלייה 40x40', main: '7291027022332', colors: [['לבן', 2], ['עץ', 5]] },
  { group: 'מסגרת תלייה 50x50', main: '7291027022349', colors: [['עץ', 6], ['לבן', 6]] },
]
const SINGLES = [
  { name: 'מסגרת 40x40 עץ', barcode: '7291027077806', qty: 12 },
  { name: 'מסגרת 20x25 עץ', barcode: '7291027072061', qty: 3 },
]
const DELETE_GROUPS = ['מסגרת 40x50', 'מסגרת 50x50']

// ---- albums
const ALBUM_CREATES = [
  ['7291027007224', 'אלבום 300 תמונות 10x15', 15],
  ['7430100247662', 'אלבום פרגמנט קנבס 30x30', 12],
  ['7430100210499', 'אלבום שורשים 140 עמודים דביקים', 6],
  ['7291027007032', 'אלבום פרגמנט 80 עמודים', 14],
  ['7291027071316', 'אלבום פרגמנט 50 עמודים', 21],
  ['7291027004482', 'אלבום מגנטי 100 עמודים', 2],
  ['7291027050014', 'אלבום 13x18 דמוי עור', 49],
  ['7291027040862', 'אלבום 13x18 144 תמונות', 12],
  ['7430100225929', 'אלבום 402 תמונות', 2],
  ['7291027006158', 'אלבום 21x21 36 עמודים', 12],
  ['7291027040847', 'אלבום 10x15 300 תמונות', 11],
]
const ALBUM_REACTIVATE = [['7291027004161', 17], ['7291027004024', 12], ['7291027004628', 24]]
const ALBUM_HIDE = ['7291027004321', '7291027004468', '7291027004444', '7291027007179', '7291027004116', '7291027004826', '7291027004208', '7291027040824', '7291027040867', '7291027050106', '7291027052049', '7291027007223']
const ALBUM_STOCK = [
  ['7291027004246', 8], ['7291027004222', 50], ['7291027004239', 77], ['7291027007209', 40],
  ['7291027052056', 24], ['7291027007230', 5], ['7291027004215', 40], ['7291027007308', 27],
  ['7291027050045', 18], ['7291027007261', 17], ['7291027040701', 13], ['7291027052001', 10],
  ['7291027007155', 12], ['7291027007162', 12], ['7291027004345', 10], ['7291027004420', 9],
  ['7291027004307', 12], ['7291027004147', 9], ['7291027052032', 36], ['7291027007216', 24],
  ['7291027004604', 45], ['7291027004086', 23], ['7291027007131', 24], ['7291027045652', 24],
  ['7291027040206', 15],
]

// ---- pewter: reactivate hidden counted products (by real barcode) + stock
const PEWTER_ACTIVATE = [
  ['7291027007971', 5], ['7291027021366', 2], ['7291027031303', 5], ['7291027030993', 6],
  ['7291027007988', 6], ['7291027021342', 23], ['7291027021335', 14], ['7291027010223', 4],
  ['7291027010230', 5], ['7291027010254', 3], ['7291027007964', 5], ['7291027468154', 28],
  ['7291027468130', 35], ['7291027468109', 19], ['7291027076267', 0], ['7291027072016', 0],
]
const PEWTER_STOCK = [
  ['7291027030832', 3], ['7291027010438', 23], ['7291027021274', 4], ['7291027031518', 4],
  ['7291027021281', 2], ['7291027010452', 24], ['7291027010445', 24], ['7291027031532', 17],
  ['7291027021540', 14], ['7291027021564', 5], ['7291027010421', 26], ['7291027031433', 36],
  ['7291027031426', 23], ['7291027031020', 7], ['7291027031037', 9], ['7291027031044', 9],
  ['7291027010476', 3], ['7291027010483', 1], ['7291027031051', 7], ['7291027031068', 6],
  ['7291027031075', 6], ['7291027021397', 6], ['7291027021403', 2],
  ['7291027200648', 15], ['7291027200709', 12], ['7291027200655', 10], ['7291027200624', 32],
]
const PEWTER_CREATES = [
  ['7291027030459', 'פיוטר 2 תמונות שחור-לבן 10x15', 10],
  ['7291027010407', 'פיוטר 10x15 נדנדה כסף', 22],
  ['7291027010261', 'פיוטר 10x15 כסף', 1],
  ['7291027010285', 'פיוטר טווינס כסוף 13x18', 4],
  ['7291027007996', 'פיוטר 3 כסף 10x15', 4],
  ['7291027008008', 'פיוטר 3 זהב 10x15', 4],
]

const COLOR_MASC = { לבנה: 'לבן', שחורה: 'שחור' }
const log = (s) => console.log(s)
const backup = []
let nextInternal = 60090

async function nextCode() {
  for (; nextInternal < 70000; nextInternal++) {
    const c = String(nextInternal)
    const taken =
      (await prisma.product.findUnique({ where: { barcode: c }, select: { id: true } })) ||
      (await prisma.productBarcodeAlias.findUnique({ where: { barcode: c }, select: { id: true } }))
    if (!taken) return String(nextInternal++)
  }
  throw new Error('NO_FREE_BARCODE')
}

async function soldSince(productId) {
  const agg = await prisma.orderItem.aggregate({
    where: {
      productId,
      order: { number: { not: null }, submittedAt: { gte: COUNT_CUTOFF }, status: { not: 'CANCELLED' } },
    },
    _sum: { qtyOrdered: true },
  })
  return agg._sum.qtyOrdered ?? 0
}

async function setStock(product, counted) {
  const sold = await soldSince(product.id)
  const stockQty = Math.max(0, counted - sold)
  log(`   stock "${product.name}": counted ${counted} − sold ${sold} = ${stockQty}`)
  if (APPLY) await prisma.product.update({ where: { id: product.id }, data: { stockQty } })
}

async function snap(p) {
  backup.push({ id: p.id, name: p.name, barcode: p.barcode, status: p.status, groupName: p.groupName, invoiceBarcode: p.invoiceBarcode, categoryId: p.categoryId, stockQty: p.stockQty })
}

async function upsertVariant(catId, groupName, name, billing, counted) {
  let p = await prisma.product.findFirst({ where: { name } })
  if (!p) {
    // color naming fallback: masculine form already in DB? (e.g. "מסגרת תלייה 40x40 לבן")
    const alt = Object.entries(COLOR_MASC).find(([fem]) => name.endsWith(' ' + fem))
    if (alt) p = await prisma.product.findFirst({ where: { name: name.replace(new RegExp(alt[0] + '$'), alt[1]) } })
  }
  if (p) {
    await snap(p)
    log(`   ensure "${p.name}" ACTIVE, bill ${billing}`)
    if (APPLY) p = await prisma.product.update({ where: { id: p.id }, data: { status: 'ACTIVE', groupName, invoiceBarcode: billing } })
  } else {
    const barcode = await nextCode()
    log(`   CREATE "${name}" (internal ${barcode}, bill ${billing})`)
    if (APPLY) {
      p = await prisma.product.create({ data: { name, barcode, categoryId: catId, priceAgorot: 0, status: 'ACTIVE', groupName, invoiceBarcode: billing } })
    }
  }
  if (p && counted !== null) await setStock(p, counted)
  return p
}

async function hideProduct(p, reason) {
  await snap(p)
  log(`   HIDE "${p.name}" (${p.barcode}) — ${reason}`)
  if (APPLY) await prisma.product.update({ where: { id: p.id }, data: { status: 'HIDDEN' } })
}

async function findByBarcode(barcode) {
  const direct = await prisma.product.findUnique({ where: { barcode } })
  if (direct) return direct
  const alias = await prisma.productBarcodeAlias.findUnique({ where: { barcode }, include: { product: true } })
  return alias?.product ?? null
}

async function main() {
  const framesCat = await prisma.category.findFirst({ where: { name: 'מסגרות' } })
  const albumsCat = await prisma.category.findFirst({ where: { name: 'אלבומים' } })

  // ---------- 1. frame size groups ----------
  for (const g of FRAME_GROUPS) {
    const groupName = `מסגרת ${g.size}`
    log(`\n== ${groupName} → bill ${g.main}`)
    const wanted = new Set(g.colors.map(([c]) => c))
    for (const [color, qty] of g.colors) {
      await upsertVariant(framesCat.id, groupName, `${groupName} ${color}`, g.main, qty)
    }
    // hide group members whose color isn't wanted
    const members = await prisma.product.findMany({ where: { groupName, status: { not: 'HIDDEN' } } })
    for (const m of members) {
      const label = m.name.replace(groupName, '').trim()
      if (label && !wanted.has(label)) await hideProduct(m, 'צבע לא בספירה')
    }
  }

  // ---------- 2. 30x45 (two billing SKUs) ----------
  log(`\n== מסגרת 30x45 (שני מק"טים)`)
  for (const [color, qty] of G3045.keep) {
    await upsertVariant(framesCat.id, 'מסגרת 30x45', `מסגרת 30x45 ${color}`, '7291027074683', qty)
  }
  for (const [color, qty] of G3045.add.colors) {
    await upsertVariant(framesCat.id, 'מסגרת 30x45', `מסגרת 30x45 ${color}`, G3045.add.main, qty)
  }

  // ---------- 3. special groups + singles ----------
  for (const s of SPECIALS) {
    log(`\n== ${s.group} → bill ${s.main}`)
    for (const [color, qty] of s.colors) {
      await upsertVariant(framesCat.id, s.group, `${s.group} ${color}`, s.main, qty)
    }
  }
  for (const s of SINGLES) {
    log(`\n== single ${s.name}`)
    const existing = await findByBarcode(s.barcode)
    if (existing) {
      await snap(existing)
      log(`   ensure "${existing.name}" ACTIVE (bill ${s.barcode})`)
      if (APPLY) await prisma.product.update({ where: { id: existing.id }, data: { status: 'ACTIVE', invoiceBarcode: s.barcode } })
      await setStock(existing, s.qty)
    } else {
      log(`   CREATE "${s.name}" (real ${s.barcode})`)
      if (APPLY) {
        const p = await prisma.product.create({ data: { name: s.name, barcode: s.barcode, categoryId: framesCat.id, priceAgorot: 0, status: 'ACTIVE' } })
        await setStock(p, s.qty)
      }
    }
  }

  // ---------- 4. delete 40x50 + 50x50 ----------
  for (const groupName of DELETE_GROUPS) {
    log(`\n== DELETE ${groupName}`)
    const members = await prisma.product.findMany({ where: { groupName }, include: { _count: { select: { orderItems: true } } } })
    for (const m of members) {
      await snap(m)
      if (m._count.orderItems > 0) {
        log(`   HIDE "${m.name}" (${m.barcode}) — יש היסטוריית הזמנות, לא ניתן למחוק`)
        if (APPLY) await prisma.product.update({ where: { id: m.id }, data: { status: 'HIDDEN' } })
      } else {
        log(`   DELETE "${m.name}" (${m.barcode})`)
        if (APPLY) await prisma.product.delete({ where: { id: m.id } })
      }
    }
  }

  // ---------- 5. albums ----------
  log('\n== אלבומים: יצירות')
  for (const [barcode, name, qty] of ALBUM_CREATES) {
    const existing = await findByBarcode(barcode)
    if (existing) {
      await snap(existing)
      log(`   exists ${barcode} "${existing.name}" — ensure ACTIVE`)
      if (APPLY) await prisma.product.update({ where: { id: existing.id }, data: { status: 'ACTIVE' } })
      await setStock(existing, qty)
    } else {
      log(`   CREATE "${name}" (${barcode})`)
      if (APPLY) {
        const p = await prisma.product.create({ data: { name, barcode, categoryId: albumsCat.id, priceAgorot: 0, status: 'ACTIVE' } })
        await setStock(p, qty)
      }
    }
  }
  log('== אלבומים: החזרה מהסתרה')
  for (const [barcode, qty] of ALBUM_REACTIVATE) {
    const p = await findByBarcode(barcode)
    if (!p) { log(`   !! not found ${barcode}`); continue }
    await snap(p)
    log(`   ACTIVATE "${p.name}"`)
    if (APPLY) await prisma.product.update({ where: { id: p.id }, data: { status: 'ACTIVE' } })
    await setStock(p, qty)
  }
  log('== אלבומים: הסתרות')
  for (const barcode of ALBUM_HIDE) {
    const p = await findByBarcode(barcode)
    if (!p) { log(`   !! not found ${barcode}`); continue }
    if (p.status !== 'HIDDEN') await hideProduct(p, 'לא בספירה')
  }
  log('== אלבומים: מלאי לקיימים')
  for (const [barcode, qty] of ALBUM_STOCK) {
    const p = await findByBarcode(barcode)
    if (p) await setStock(p, qty)
  }

  // ---------- 6. pewter ----------
  log('\n== פיוטר: החזרה מהסתרה + מלאי')
  for (const [barcode, qty] of PEWTER_ACTIVATE) {
    const p = await findByBarcode(barcode)
    if (!p) { log(`   !! not found ${barcode}`); continue }
    await snap(p)
    log(`   ACTIVATE "${p.name}" (${barcode})`)
    if (APPLY) await prisma.product.update({ where: { id: p.id }, data: { status: 'ACTIVE' } })
    if (qty > 0) await setStock(p, qty)
  }
  log('== פיוטר: מלאי לקיימים')
  for (const [barcode, qty] of PEWTER_STOCK) {
    const p = await findByBarcode(barcode)
    if (p) await setStock(p, qty)
    else log(`   !! not found ${barcode}`)
  }
  log('== פיוטר: יצירות')
  for (const [barcode, name, qty] of PEWTER_CREATES) {
    const existing = await findByBarcode(barcode)
    if (existing) {
      await snap(existing)
      log(`   exists ${barcode} "${existing.name}" — ensure ACTIVE`)
      if (APPLY) await prisma.product.update({ where: { id: existing.id }, data: { status: 'ACTIVE' } })
      await setStock(existing, qty)
      continue
    }
    log(`   CREATE "${name}" (${barcode})`)
    if (APPLY) {
      const p = await prisma.product.create({ data: { name, barcode, categoryId: framesCat.id, priceAgorot: 0, status: 'ACTIVE' } })
      await setStock(p, qty)
    }
  }
  // pewter 20/30: כסף bills under the real long SKU; זהב hidden
  log('== פיוטר 20/30')
  const silver2030 = await prisma.product.findUnique({ where: { barcode: '60054' } })
  if (silver2030) {
    await snap(silver2030)
    log(`   "${silver2030.name}" bill → 729102746205, stock 2`)
    if (APPLY) await prisma.product.update({ where: { id: silver2030.id }, data: { invoiceBarcode: '729102746205' } })
    await setStock(silver2030, 2)
  }
  const gold2030 = await prisma.product.findUnique({ where: { barcode: '60055' } })
  if (gold2030 && gold2030.status !== 'HIDDEN') await hideProduct(gold2030, 'לא בספירה (תשובה 13)')

  // ---------- 7. clean drafts referencing hidden/deleted products ----------
  log('\n== ניקוי טיוטות')
  const drafts = await prisma.order.findMany({
    where: { status: 'DRAFT' },
    include: { store: { select: { name: true } }, items: { include: { product: { select: { id: true, name: true, status: true } } } } },
  })
  for (const d of drafts) {
    const bad = d.items.filter((i) => i.product.status === 'HIDDEN')
    for (const b of bad) {
      log(`   remove from draft (${d.store.name}): ${b.product.name} x${b.qtyOrdered}`)
      if (APPLY) await prisma.orderItem.delete({ where: { id: b.id } })
    }
  }

  if (APPLY) {
    const f = path.join(__dirname, `inventory-apply-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
    fs.writeFileSync(f, JSON.stringify(backup, null, 2))
    log(`\nAPPLIED. backup: ${f}`)
  } else {
    log('\nDRY RUN — הרץ עם --apply לביצוע')
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
