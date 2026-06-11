import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    globalSetup: './tests/setup.ts',
    // E2E specs run under Playwright, not Vitest
    exclude: ['node_modules/**', 'tests/e2e/**'],
    // Integration tests share a single SQLite test DB — run files sequentially
    fileParallelism: false,
    sequence: { concurrent: false },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
