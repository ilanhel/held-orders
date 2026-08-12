/* eslint-disable */
// One-off bulk recategorization by product-name keywords.
//
//   Dry-run (no DB writes):   node import/recategorize.js
//   Apply to DB:              node import/recategorize.js --apply
//
// Rules (first match wins, checked in this order):
//   בלינדרמים   : מסגרת קנבס / בלינדרם / מסגרת עץ לקנבס
//   אקרילי      : אקריל / פרספקס / בלוק אקרילי
//   בלוקי עץ    : בלוק עץ / אורן / הולנדי / צפצפה
//   אלבומים     : אלבום
//   מסגרות      : מסגרת
//   סוללות      : סוללה
//   דיו         : דיו
//   הגדלות ענק  : הגדלות/הגדלת/הגדלה + ענק
//   סובלימציה   : ספל / כוס / סובלימציה / שלט / תיק
//   מעמדים      : מעמד
//   אריזות      : שקית / שקיות / צלופן
//   נייר להדפסה : נייר
//   משרדי       : סרט / סיכה / סיכות / דבק
//   שונות       : fallback — only for products currently in "לא משויך"
// Extra: every product still in category "פרספקס" moves to "אקרילי".
//
// A backup of previous categories is written to import/recat-backup-<ts>.json.

const fs = require('fs')
const path = require('path')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

const PLACEHOLDER = 'לא משויך'
const PERSPEX = 'פרספקס'

// Order matters: first matching rule wins.
const RULES = [
  { category: 'בלינדרמים', re: /מסגרת קנבס|בלינדרם|מסגרת עץ לקנבס/ },
  { category: 'אקרילי', re: /אקריל|פרספקס/ },
  { category: 'בלוקי עץ', re: /בלוק עץ|אורן|הולנדי|צפצפה/ },
  { category: 'אלבומים', re: /אלבום/ },
  { category: 'מסגרות', re: /מסגרת|מסגרות/ },
  { category: 'סוללות', re: /סולל|ENEGIZER|ENERGIZER/i },
  { category: 'דיו', re: /דיו/ },
  { category: 'הגדלות ענק', re: /הגדל(ה|ות|ת)?\s*ענק/ },
  { category: 'סובלימציה', re: /ספל|כוס|סובלימצי|שלט|תיק/ },
  { category: 'מעמדים', re: /מעמד/ },
  { category: 'אריזות', re: /שקית|שקיות|צלופן/ },
  { category: 'נייר להדפסה', re: /נייר/ },
  { category: 'משרדי', re: /סרט|סיכ(ה|ות)|דבק/ },
]
const FALLBACK = 'שונות'

const TARGET_NAMES = [...new Set([...RULES.map((r) => r.category), FALLBACK])]

function matchCategory(name) {
  for (const rule of RULES) {
    if (rule.re.test(name)) return rule.category
  }
  return null
}

async function ensureCategories() {
  const existing = await prisma.category.findMany()
  const byName = new Map(existing.map((c) => [c.name, c]))
  let maxSort = existing.reduce((m, c) => Math.max(m, c.sortOrder), 0)
  for (const name of TARGET_NAMES) {
    if (!byName.has(name)) {
      maxSort += 10
      if (APPLY) {
        const created = await prisma.category.create({
          data: { name, sortOrder: maxSort },
        })
        byName.set(name, created)
      } else {
        console.log(`[dry-run] would create category: ${name}`)
        byName.set(name, { id: `NEW:${name}`, name, sortOrder: maxSort })
      }
    }
  }
  return byName
}

async function main() {
  const byName = await ensureCategories()
  const catById = new Map(
    [...byName.values()].map((c) => [c.id, c.name])
  )
  const placeholderId = byName.get(PLACEHOLDER)?.id ?? null
  const perspexId = byName.get(PERSPEX)?.id ?? null

  const products = await prisma.product.findMany({
    select: { id: true, name: true, barcode: true, categoryId: true },
  })

  const moves = [] // { id, name, barcode, from, to }
  for (const p of products) {
    let target = matchCategory(p.name)
    if (!target && p.categoryId === perspexId) target = 'אקרילי'
    if (!target && placeholderId && p.categoryId === placeholderId)
      target = FALLBACK
    if (!target) continue
    const targetId = byName.get(target).id
    if (targetId === p.categoryId) continue
    moves.push({
      id: p.id,
      name: p.name,
      barcode: p.barcode,
      from: catById.get(p.categoryId) ?? p.categoryId,
      to: target,
    })
  }

  // Summary per target category
  const perTarget = new Map()
  for (const m of moves) {
    if (!perTarget.has(m.to)) perTarget.set(m.to, [])
    perTarget.get(m.to).push(m)
  }

  console.log(`Products total: ${products.length}, to move: ${moves.length}\n`)
  for (const [to, list] of [...perTarget.entries()].sort()) {
    console.log(`=== ${to} (${list.length}) ===`)
    for (const m of list) console.log(`  [${m.from}] ${m.name} (${m.barcode})`)
    console.log('')
  }

  if (!APPLY) {
    console.log('Dry-run only. Re-run with --apply to write changes.')
    return
  }

  // Backup previous assignments before writing
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const backupFile = path.join(__dirname, `recat-backup-${ts}.json`)
  fs.writeFileSync(backupFile, JSON.stringify(moves, null, 2), 'utf8')
  console.log(`Backup written: ${backupFile}`)

  // Group updates by target category for efficient updateMany
  for (const [to, list] of perTarget.entries()) {
    const targetId = byName.get(to).id
    const res = await prisma.product.updateMany({
      where: { id: { in: list.map((m) => m.id) } },
      data: { categoryId: targetId },
    })
    console.log(`Updated ${res.count} -> ${to}`)
  }
  console.log('Done.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
