// One-off / repeatable: issue a 6-digit login password for every branch and
// every WAREHOUSE/ADMIN user that doesn't have one yet, then print the full
// list to hand out. Existing passwords are NOT changed.
//
//   set -a; source .env.local; set +a; node scripts/issue-login-codes.mjs
//
import { PrismaClient, Role } from '@prisma/client'
import { randomInt } from 'crypto'

const prisma = new PrismaClient()

async function uniqueCode() {
  for (let i = 0; i < 50; i++) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
    const [s, u] = await Promise.all([
      prisma.store.findUnique({ where: { loginCode: code }, select: { id: true } }),
      prisma.user.findUnique({ where: { loginCode: code }, select: { id: true } }),
    ])
    if (!s && !u) return code
  }
  throw new Error('CODE_GENERATION_FAILED')
}

async function main() {
  const stores = await prisma.store.findMany({ orderBy: { name: 'asc' } })
  let issued = 0
  console.log('=== סיסמאות סניפים ===')
  for (const s of stores) {
    let code = s.loginCode
    if (!code) {
      code = await uniqueCode()
      await prisma.store.update({ where: { id: s.id }, data: { loginCode: code } })
      issued++
    }
    console.log(`${code}  ${s.code.padEnd(10)} ${s.name}${s.active ? '' : '  (מושבת)'}`)
  }

  const staff = await prisma.user.findMany({
    where: { role: { in: [Role.WAREHOUSE, Role.ADMIN] } },
    orderBy: { name: 'asc' },
  })
  console.log('\n=== סיסמאות מחסן/מנהל ===')
  for (const u of staff) {
    let code = u.loginCode
    if (!code) {
      code = await uniqueCode()
      await prisma.user.update({ where: { id: u.id }, data: { loginCode: code } })
      issued++
    }
    console.log(`${code}  ${u.role.padEnd(10)} ${u.name}${u.active ? '' : '  (מושבת)'}`)
  }

  console.log(`\nהונפקו ${issued} סיסמאות חדשות (קיימות לא שונו).`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
