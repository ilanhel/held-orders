import { config } from 'dotenv'
import { execSync } from 'child_process'
import path from 'path'
import fs from 'fs'
import EmbeddedPostgres from 'embedded-postgres'

let pg: EmbeddedPostgres | undefined

export async function setup() {
  // Load test env BEFORE anything else (workers inherit process.env from here)
  config({ path: path.resolve(process.cwd(), '.env.test'), override: true })

  const dataDir = path.resolve(process.cwd(), '.tmp', 'pgdata')
  const port = 54329

  // Start from a clean data dir for full isolation between runs.
  fs.rmSync(dataDir, { recursive: true, force: true })

  pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'postgres',
    port,
    persistent: false,
  })

  await pg.initialise()
  await pg.start()
  await pg.createDatabase('held_test')

  // Apply migrations to the fresh local database.
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: { ...process.env } })
}

export async function teardown() {
  if (pg) {
    await pg.stop()
  }
}
