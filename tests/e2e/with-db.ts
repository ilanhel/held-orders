/**
 * E2E test server launcher.
 *
 * Starts a dedicated local embedded PostgreSQL, applies migrations, seeds demo
 * data, then runs `next dev`. Used as the Playwright `webServer` command so the
 * whole E2E stack is fully local (no remote/production DB involved).
 */
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import EmbeddedPostgres from 'embedded-postgres'

const PORT = 3100
const PG_PORT = 54330
const DB_NAME = 'held_e2e'
const DATA_DIR = path.resolve(process.cwd(), '.tmp', 'pge2e')
const DB_URL = `postgresql://postgres:postgres@localhost:${PG_PORT}/${DB_NAME}?schema=public`

async function run(cmd: string, args: string[], env: NodeJS.ProcessEnv) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', env })
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`))
    )
    child.on('error', reject)
  })
}

async function main() {
  fs.rmSync(DATA_DIR, { recursive: true, force: true })

  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: 'postgres',
    password: 'postgres',
    port: PG_PORT,
    persistent: false,
  })

  await pg.initialise()
  await pg.start()
  await pg.createDatabase(DB_NAME)

  const env = { ...process.env, DATABASE_URL: DB_URL, DIRECT_URL: DB_URL }

  await run('npx', ['prisma', 'migrate', 'deploy'], env)
  await run('npx', ['tsx', 'prisma/seed.ts'], env)

  const next = spawn(
    'npx',
    ['next', 'dev', '-p', String(PORT)],
    {
      stdio: 'inherit',
      env: { ...env, E2E_FIXED_OTP: '000000', NOTIFICATION_DRIVER: 'console' },
    }
  )

  const shutdown = async () => {
    next.kill('SIGTERM')
    try {
      await pg.stop()
    } catch {
      // ignore shutdown errors
    }
    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
  next.on('exit', (code) => {
    void pg.stop().finally(() => process.exit(code ?? 0))
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
