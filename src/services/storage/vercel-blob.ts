import { put } from '@vercel/blob'
import type { StorageDriver, UploadInput, UploadResult } from './types'

/**
 * Vercel Blob driver (production). Requires the BLOB_READ_WRITE_TOKEN env var,
 * which Vercel injects automatically once a Blob store is connected to the
 * project. Objects are stored with public access so <img src> works directly.
 */
export class VercelBlobDriver implements StorageDriver {
  readonly name = 'vercel-blob'

  async upload(input: UploadInput): Promise<UploadResult> {
    const token = process.env.BLOB_READ_WRITE_TOKEN
    if (!token) throw new Error('BLOB_NOT_CONFIGURED')

    const blob = await put(input.key, input.data, {
      access: 'public',
      contentType: input.contentType,
      token,
      // A given product key is overwritten when a new image is uploaded.
      allowOverwrite: true,
    })

    return { url: blob.url }
  }
}
