/**
 * Object storage abstraction (product images, etc.).
 *
 * A driver uploads a binary object and returns a publicly reachable URL.
 * Drivers are selected at runtime from env (see ./index.ts) so the rest of
 * the app never depends on a specific provider:
 *   - "vercel-blob": Vercel Blob (production) — requires BLOB_READ_WRITE_TOKEN.
 *   - "local":       writes to public/uploads (dev only, never on Vercel).
 *   - "mock":        returns a deterministic fake URL (tests).
 */

export interface UploadInput {
  /** Stable object key, e.g. "products/<id>.jpg". */
  key: string
  /** Raw file bytes. */
  data: Buffer
  /** MIME type, e.g. "image/jpeg". */
  contentType: string
}

export interface UploadResult {
  /** Publicly reachable URL of the stored object. */
  url: string
}

export interface StorageDriver {
  readonly name: string
  upload(input: UploadInput): Promise<UploadResult>
}
