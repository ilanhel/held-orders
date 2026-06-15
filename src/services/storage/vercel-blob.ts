import { put } from '@vercel/blob'
import type { StorageDriver, UploadInput, UploadResult } from './types'

/**
 * Vercel Blob driver (production). Authenticates one of two ways:
 *   1. A static BLOB_READ_WRITE_TOKEN env var, or
 *   2. Vercel OIDC (the default for connected stores) — the SDK resolves the
 *      short-lived VERCEL_OIDC_TOKEN together with BLOB_STORE_ID at runtime.
 * Objects are stored with public access so <img src> works directly.
 */
export class VercelBlobDriver implements StorageDriver {
  readonly name = 'vercel-blob'

  async upload(input: UploadInput): Promise<UploadResult> {
    const token = process.env.BLOB_READ_WRITE_TOKEN
    // Either a static token or an OIDC-connected store (BLOB_STORE_ID) is
    // required. When only the store id is present the SDK uses OIDC auth.
    if (!token && !process.env.BLOB_STORE_ID) throw new Error('BLOB_NOT_CONFIGURED')

    const blob = await put(input.key, input.data, {
      access: 'public',
      contentType: input.contentType,
      // Pass the static token only when set; otherwise the SDK falls back to
      // OIDC auth (VERCEL_OIDC_TOKEN + BLOB_STORE_ID).
      ...(token ? { token } : {}),
      // A given product key is overwritten when a new image is uploaded.
      allowOverwrite: true,
    })

    return { url: blob.url }
  }
}
