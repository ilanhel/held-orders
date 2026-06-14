import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import type { StorageDriver, UploadInput, UploadResult } from './types'

/**
 * Local filesystem driver for development only. Writes uploads to
 * public/uploads/<key> so Next.js serves them at /uploads/<key>.
 *
 * NOTE: this does NOT work on Vercel (read-only filesystem) — production must
 * use the Vercel Blob driver. The selector in ./index.ts only picks this
 * driver outside of a serverless production environment.
 */
export class LocalStorageDriver implements StorageDriver {
  readonly name = 'local'

  async upload(input: UploadInput): Promise<UploadResult> {
    const safeKey = input.key.replace(/\.\.+/g, '').replace(/^\/+/, '')
    const filePath = path.join(process.cwd(), 'public', 'uploads', safeKey)
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, input.data)
    return { url: `/uploads/${safeKey}` }
  }
}
