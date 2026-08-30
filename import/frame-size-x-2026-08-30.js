// One-off: normalize size separators in FRAME product names to lowercase "x".
// "10X15" / "10*15" / "10/15" / "10 X 15" → "10x15". Frames only (name contains מסגרת),
// all statuses (hidden variants stay consistent for future reactivation).
// Run: set -a; source .env.local; set +a; node import/frame-size-x-2026-08-30.js [--apply]

const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

const SIZE_RE = /(\d+(?:\.\d+)?)\s*[xX×*\/]\s*(\d+(?:\.\d+)?)/g

async function main() {
  const rows = await prisma.product.findMany({
    where: { name: { contains: 'מסגרת' } },
    select: { id: true, barcode: true, name: true },
    orderBy: { name: 'asc' },
  })

  const changes = rows
    .map((r) => ({ ...r, newName: r.name.replace(SIZE_RE, '$1x$2') }))
    .filter((r) => r.newName !== r.name)

  if (APPLY && changes.length) {
    const file = `import/frame-size-x-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    fs.writeFileSync(file, JSON.stringify(changes.map(({ id, barcode, name }) => ({ id, barcode, name })), null, 2))
    console.log('backup →', file)
  }

  for (const c of changes) {
    console.log(`${APPLY ? '[APPLY]' : '[DRY]'} ${c.barcode} | "${c.name}" → "${c.newName}"`)
    if (APPLY) await prisma.product.update({ where: { id: c.id }, data: { name: c.newName } })
  }
  console.log(`--- ${changes.length} renames.`, APPLY ? 'DONE.' : 'Dry-run only. Re-run with --apply.')
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
