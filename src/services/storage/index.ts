import type { StorageDriver, UploadInput, UploadResult } from './types'
import { VercelBlobDriver } from './vercel-blob'
import { LocalStorageDriver } from './local'
import { MockStorageDriver } from './mock'

/**
 * Object storage facade. The active driver is chosen from env:
 *   STORAGE_DRIVER = "vercel-blob" | "local" | "mock"
 * When unset, it auto-detects: a configured Vercel Blob token wins, otherwise
 * the local-disk driver is used for development.
 */
function resolveDriver(): StorageDriver {
  const name = (process.env.STORAGE_DRIVER || '').toLowerCase()
  if (name === 'mock') return new MockStorageDriver()
  if (name === 'local') return new LocalStorageDriver()
  if (name === 'vercel-blob' || name === 'vercelblob') return new VercelBlobDriver()

  // Auto-detect: prefer Vercel Blob when a token is present (i.e. production).
  if (process.env.BLOB_READ_WRITE_TOKEN) return new VercelBlobDriver()
  return new LocalStorageDriver()
}

let driver: StorageDriver = resolveDriver()

export const StorageService = {
  upload(input: UploadInput): Promise<UploadResult> {
    return driver.upload(input)
  },
  /** Active driver name (diagnostics). */
  driverName(): string {
    return driver.name
  },
  /** Re-read STORAGE_DRIVER / token from env (used by tests). */
  reloadFromEnv(): void {
    driver = resolveDriver()
  },
  /** Override the driver directly (used by tests). */
  setDriver(next: StorageDriver): void {
    driver = next
  },
}

export type { StorageDriver, UploadInput, UploadResult }
