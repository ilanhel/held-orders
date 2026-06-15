import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rm } from 'fs/promises'
import path from 'path'
import { StorageService } from '@/services/storage'
import { MockStorageDriver } from '@/services/storage/mock'
import { LocalStorageDriver } from '@/services/storage/local'
import { VercelBlobDriver } from '@/services/storage/vercel-blob'

describe('StorageService driver selection', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.STORAGE_DRIVER
    delete process.env.BLOB_READ_WRITE_TOKEN
    delete process.env.BLOB_STORE_ID
  })

  afterEach(() => {
    process.env = originalEnv
    StorageService.reloadFromEnv()
  })

  it('uses the mock driver when STORAGE_DRIVER=mock', () => {
    process.env.STORAGE_DRIVER = 'mock'
    StorageService.reloadFromEnv()
    expect(StorageService.driverName()).toBe('mock')
  })

  it('uses the local driver when STORAGE_DRIVER=local', () => {
    process.env.STORAGE_DRIVER = 'local'
    StorageService.reloadFromEnv()
    expect(StorageService.driverName()).toBe('local')
  })

  it('auto-detects vercel-blob when a token is present', () => {
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_test'
    StorageService.reloadFromEnv()
    expect(StorageService.driverName()).toBe('vercel-blob')
  })

  it('auto-detects vercel-blob via OIDC when only BLOB_STORE_ID is present', () => {
    process.env.BLOB_STORE_ID = 'store_test'
    StorageService.reloadFromEnv()
    expect(StorageService.driverName()).toBe('vercel-blob')
  })

  it('falls back to local when no token and no driver set', () => {
    StorageService.reloadFromEnv()
    expect(StorageService.driverName()).toBe('local')
  })
})

describe('MockStorageDriver', () => {
  it('records uploads and returns a deterministic url', async () => {
    const driver = new MockStorageDriver()
    const result = await driver.upload({
      key: 'products/abc.jpg',
      data: Buffer.from([1, 2, 3]),
      contentType: 'image/jpeg',
    })
    expect(result.url).toBe('https://mock.storage.local/products/abc.jpg')
    expect(driver.uploads).toHaveLength(1)
    expect(driver.uploads[0].contentType).toBe('image/jpeg')
  })
})

describe('VercelBlobDriver', () => {
  const originalEnv = process.env
  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.BLOB_READ_WRITE_TOKEN
    delete process.env.BLOB_STORE_ID
  })
  afterEach(() => {
    process.env = originalEnv
  })

  it('throws BLOB_NOT_CONFIGURED without a token or store id', async () => {
    const driver = new VercelBlobDriver()
    await expect(
      driver.upload({
        key: 'products/x.jpg',
        data: Buffer.from([1]),
        contentType: 'image/jpeg',
      })
    ).rejects.toThrow('BLOB_NOT_CONFIGURED')
  })
})

describe('LocalStorageDriver', () => {
  it('sanitizes the key into a /uploads url', async () => {
    const driver = new LocalStorageDriver()
    const result = await driver.upload({
      key: 'products/safe-test-image.png',
      data: Buffer.from([1, 2, 3, 4]),
      contentType: 'image/png',
    })
    expect(result.url).toBe('/uploads/products/safe-test-image.png')
    // Clean up the artifact written to public/uploads.
    await rm(path.join(process.cwd(), 'public', 'uploads', 'products', 'safe-test-image.png'), {
      force: true,
    })
  })
})
