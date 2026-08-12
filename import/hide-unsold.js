/* eslint-disable */
// One-off: hide (status=HIDDEN) every product NOT present in the recently-sold list.
// A product stays alive only if BOTH barcode AND name match a line in the list
// (whitespace-normalized exact name comparison).
//
//   Dry-run (no DB writes):   node import/hide-unsold.js
//   Apply to DB:              node import/hide-unsold.js --apply
//
// List file: import/sold-2026-07-27.tsv  (barcode<TAB>name per line)
// A backup of previous statuses is written to import/hide-backup-<ts>.json.

const fs = require('fs')
const path = require('path')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')
const LIST_FILE = path.join(__dirname, 'sold-2026-07-27.tsv')

const norm = (s) => (s || '').replace(/\s+/g, ' ').trim()

function loadList() {
  const map = new Map() // barcode -> normalized name
  const lines = fs.readFileSync(LIST_FILE, 'utf8').split('\n')
  for (const line of lines) {
    if (!line.trim()) continue
    const tab = line.indexOf('\t')
    if (tab === -1) continue
    const barcode = line.slice(0, tab).trim()
    const name = norm(line.slice(tab + 1))
    if (barcode) map.set(barcode, name)
  }
  return map
}

async function main() {
  const list = loadList()
  console.log(`List entries: ${list.size}`)

  const products = await prisma.product.findMany({
    select: { id: true, barcode: true, name: true, status: true },
  })
  console.log(`Products in DB: ${products.length}`)

  const keep = []            // barcode+name match, already visible
  const keepButHidden = []   // matches list but currently HIDDEN (reported, untouched)
  const hideNoBarcode = []   // barcode not in list
  const hideNameMismatch = []// barcode in list but name differs
  const alreadyHidden = []   // not in list, already HIDDEN

  const dbBarcodes = new Set(products.map((p) => p.barcode))

  for (const p of products) {
    const listName = list.get(p.barcode)
    if (listName !== undefined && norm(p.name) === listName) {
      if (p.status === 'HIDDEN') keepButHidden.push(p)
      else keep.push(p)
    } else if (p.status === 'HIDDEN') {
      alreadyHidden.push(p)
    } else if (listName !== undefined) {
      hideNameMismatch.push({ ...p, listName })
    } else {
      hideNoBarcode.push(p)
    }
  }

  const notInDb = [...list.keys()].filter((b) => !dbBarcodes.has(b))

  console.log(`\nKEEP alive (exact barcode+name match): ${keep.length}`)
  console.log(`MATCH but currently HIDDEN (left untouched): ${keepButHidden.length}`)
  for (const p of keepButHidden) console.log(`  ~ ${p.barcode}  ${p.name}`)
  console.log(`\nHIDE — name mismatch (barcode found, name differs): ${hideNameMismatch.length}`)
  for (const p of hideNameMismatch)
    console.log(`  ! ${p.barcode}\n      DB:   "${p.name}"\n      List: "${p.listName}"`)
  console.log(`\nHIDE — barcode not in list: ${hideNoBarcode.length}`)
  console.log(`Already HIDDEN (unchanged): ${alreadyHidden.length}`)
  console.log(`List barcodes NOT in DB at all: ${notInDb.length}`)
  for (const b of notInDb) console.log(`  ? ${b}  "${list.get(b)}"`)

  const toHide = [...hideNoBarcode, ...hideNameMismatch]

  if (!APPLY) {
    console.log(`\nDRY-RUN. Would hide ${toHide.length} products. Run with --apply to write.`)
    await prisma.$disconnect()
    return
  }

  // backup previous statuses
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const backupFile = path.join(__dirname, `hide-backup-${ts}.json`)
  fs.writeFileSync(
    backupFile,
    JSON.stringify(
      toHide.map((p) => ({ id: p.id, barcode: p.barcode, name: p.name, prevStatus: p.status })),
      null,
      2
    )
  )
  console.log(`\nBackup written: ${backupFile}`)

  const ids = toHide.map((p) => p.id)
  const CHUNK = 200
  let done = 0
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    const res = await prisma.product.updateMany({
      where: { id: { in: chunk } },
      data: { status: 'HIDDEN' },
    })
    done += res.count
    console.log(`  updated ${done}/${ids.length}`)
  }
  console.log(`\nDone. ${done} products set to HIDDEN.`)
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
