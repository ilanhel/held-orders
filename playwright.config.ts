import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E config for HELD Orders.
 *
 * The webServer runs `tests/e2e/with-db.ts`, which:
 *   1. starts a dedicated local embedded PostgreSQL
 *   2. applies migrations via `prisma migrate deploy`
 *   3. seeds demo data
 *   4. starts Next.js with a fixed OTP (E2E_FIXED_OTP) so automated logins
 *      are deterministic — this env var is NEVER set in production.
 *
 * Mobile viewport (Pixel 5) matches the product's mobile-first requirement.
 */
const PORT = 3100

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'he-IL',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],
  webServer: {
    command: `npx tsx tests/e2e/with-db.ts`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
