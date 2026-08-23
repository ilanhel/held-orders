/* eslint-disable */
// One-off recategorization batch — 2026-08-23 (run: node import/recat-2026-08-23.js [--apply])
// Dry-run by default. Writes backup JSON before applying.
const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const path = require('path')
const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

// target category name -> barcodes to move there
const MOVES = {
  'סובלימציה': [
    // בזלת (not already there)
    '857122883285', '857122883330', '857122883293',
    // בגדי גוף
    '8571228833071', '8571228833072', '8571228833073', '8571228833074', '8571228833075', '857122883307',
    // האג מאג
    '8714',
    // מחזיקי מפתחות דו"צ/ח"צ (not already there)
    '857122882024', '857122882025', '857122883172',
    // פד עכבר
    '7402',
    // סינר
    '857122883320',
    // פאזלים (למעט 500/1000 שנמחקים)
    '857122882005', '857122882004', '857122882006', '857122882007', '857122882003', '857122882002',
    // מעמד עטים, תחתיות במבוק
    '857122882001', '857122883667',
  ],
  'אקרילי': [
    '857122883211', // בורד מיני
    '857122883205', // מעמד קפסולות קפה
  ],
  'פרינטרים': [
    // מיכלי עודפים/ספיגה
    '400086', '857122883313', '857122883319', '4547410256345', '4547410361919', '4547410444650',
    // קנווס כותנה + פוליאסטר
    '6926798902033', '6970066963097', '6970066963370',
    // + כל קטגוריית "דיו" (מטופל בנפרד לפי categoryId)
  ],
  'מעמד אלומיניום': [
    '857122883027', '857122883028', '857122883024', '857122883025', '857122883026', // קליר
  ],
  'מיוחדים': [
    '857122883240', '857122883184', '857122883185', // מסגרת מוארת
    '857122883189', // קוביה מוארת
    '857122883111', '857122883112', // ריבוע בונד/עץ בודד ממוגנט
    '3401275000054', // לוח קאפה מוקצף
  ],
  'טקסטיל': [
    '857122882112', '857122882113', '1', '857122883283', '857122883322', '7186', '857122883272', // ציפה/כרית
  ],
  'מסגרות': [
    '7291027200365', // שעון לבן אופקי 4 תמונות
    '7291027200358', // שעון לבן 5 תמונות
  ],
  'שונות': [
    '857122883052', // חבל מובייל
    '857122883273', // מעמד שולחני לברכות (מוסתר)
  ],
  'משרדי': [
    // נייר להדפסה (חוץ מנטול עץ 170 גרם)
    '857122883203', '857122883310', '6970066965558', '7091276523501', '7091276523518',
    '7091526500016', '7091526500023', '7092036523502', '7096103000019',
    // 80 גרם A3/A4
    '4605817123209', '857122883267',
    // כיסים למינציה
    '857122883317', '6927972135124',
    // גליל קופה
    '857122883309',
  ],
  'אריזות': [
    '857122883194', '857122883051', // סרט אריזה
  ],
}

const DELETE_BARCODES = ['857122883210', '857122883297', '857122883164', '857122883165'] // בורד, שעון 40*40, פאזל 500, פאזל 1000
const MOVE_WHOLE_CATEGORY = { 'דיו': 'פרינטרים' } // then delete source category
const DELETE_CATEGORIES = ['דיו', 'מעמדים']
const CREATE_CATEGORIES = ['פרינטרים']

async function main() {
  const cats = await prisma.category.findMany({ select: { id: true, name: true, sortOrder: true } })
  const catByName = new Map(cats.map((c) => [c.name, c]))
  const maxSort = Math.max(...cats.map((c) => c.sortOrder ?? 0), 0)

  // 1. create new categories
  for (const name of CREATE_CATEGORIES) {
    if (catByName.has(name)) { console.log('category exists:', name); continue }
    console.log('CREATE category:', name)
    if (APPLY) {
      const c = await prisma.category.create({ data: { name, sortOrder: maxSort + 10 } })
      catByName.set(name, c)
    }
  }

  // backup
  const allBarcodes = [...new Set([...Object.values(MOVES).flat(), ...DELETE_BARCODES])]
  const affected = await prisma.product.findMany({
    where: {
      OR: [
        { barcode: { in: allBarcodes } },
        { category: { name: { in: Object.keys(MOVE_WHOLE_CATEGORY) } } },
      ],
    },
    select: { id: true, barcode: true, name: true, status: true, categoryId: true, category: { select: { name: true } } },
  })
  const backupPath = path.join(__dirname, `recat-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  if (APPLY) fs.writeFileSync(backupPath, JSON.stringify(affected, null, 2))
  const byBarcode = new Map(affected.map((x) => [x.barcode, x]))

  // 2. barcode moves
  for (const [catName, barcodes] of Object.entries(MOVES)) {
    const cat = catByName.get(catName)
    if (!cat && APPLY) throw new Error('missing category: ' + catName)
    for (const bc of barcodes) {
      const prod = byBarcode.get(bc)
      if (!prod) { console.log('!! NOT FOUND barcode:', bc, '(->', catName + ')'); continue }
      if (prod.category.name === catName) { console.log('   already in', catName + ':', prod.name); continue }
      console.log('MOVE [' + prod.category.name + ' -> ' + catName + ']', prod.barcode, prod.name)
      if (APPLY) await prisma.product.update({ where: { id: prod.id }, data: { categoryId: cat.id } })
    }
  }

  // 3. whole-category moves
  for (const [from, to] of Object.entries(MOVE_WHOLE_CATEGORY)) {
    const src = catByName.get(from)
    const dst = catByName.get(to)
    if (!src) { console.log('!! missing source category:', from); continue }
    const prods = affected.filter((x) => x.categoryId === src.id)
    console.log('MOVE ALL [' + from + ' -> ' + to + ']: ' + prods.length + ' products')
    if (APPLY) {
      if (!dst) throw new Error('missing category: ' + to)
      await prisma.product.updateMany({ where: { categoryId: src.id }, data: { categoryId: dst.id } })
    }
  }

  // 4. product deletions (hard delete if no orderItems, else HIDDEN)
  for (const bc of DELETE_BARCODES) {
    const prod = byBarcode.get(bc)
    if (!prod) { console.log('!! NOT FOUND barcode for delete:', bc); continue }
    const inOrders = await prisma.orderItem.count({ where: { productId: prod.id } })
    if (inOrders > 0) {
      console.log('HIDE (in ' + inOrders + ' orders):', prod.barcode, prod.name)
      if (APPLY) await prisma.product.update({ where: { id: prod.id }, data: { status: 'HIDDEN' } })
    } else {
      console.log('DELETE:', prod.barcode, prod.name)
      if (APPLY) await prisma.product.delete({ where: { id: prod.id } })
    }
  }

  // 5. category deletions (only if empty)
  for (const name of DELETE_CATEGORIES) {
    const cat = catByName.get(name)
    if (!cat) { console.log('!! missing category to delete:', name); continue }
    const count = APPLY ? await prisma.product.count({ where: { categoryId: cat.id } }) : null
    if (APPLY) {
      if (count > 0) { console.log('!! category not empty, skip delete:', name, '(' + count + ')'); continue }
      await prisma.category.delete({ where: { id: cat.id } })
      console.log('DELETED category:', name)
    } else {
      console.log('DELETE category (after moves):', name)
    }
  }

  console.log(APPLY ? '\nAPPLIED. Backup: ' + backupPath : '\nDRY RUN — nothing changed. Run with --apply.')
}

main().finally(() => prisma.$disconnect())
