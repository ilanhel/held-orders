import type { StorageDriver, UploadInput, UploadResult } from './types'

/**
 * In-memory mock driver for tests. Records uploads and returns a deterministic
 * URL without touching the network or filesystem.
 */
export class MockStorageDriver implements StorageDriver {
  readonly name = 'mock'
  readonly uploads: UploadInput[] = []

  async upload(input: UploadInput): Promise<UploadResult> {
    this.uploads.push(input)
    return { url: `https://mock.storage.local/${input.key}` }
  }
}
