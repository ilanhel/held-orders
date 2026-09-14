/**
 * upload-images.js — bulk product image upload.
 * Scans import/images/ for files named "<barcode>.<jpg|jpeg|png|webp>",
 * matches products by barcode (primary or alias), uploads to Vercel Blob
 * (same key convention as the admin UI) and sets Product.imagePath.
 *
 * Default: skips products that already have an image (use --overwrite to
 * replace). Dry-run by default — add --apply to actually upload.
 *
 * Run: set -a; source .env.local; set +a; node import/upload-images.js [--apply] [--overwrite]
 */
const { PrismaClient } = require('@prisma/client')
const { put } = require('@vercel/blob')
const fs = require('fs')
const path = require('path')

const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')
const OVERWRITE = process.argv.includes('--overwrite')

const IMAGES_DIR = path.join(__dirname, 'images')
const EXT_TYPE = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
const MAX_BYTES = 5 * 1024 * 1024

async function findProductByBarcode(barcode) {
  const direct = await prisma.product.findUnique({ where: { barcode } })
  if (direct) return direct
  const alias = await prisma.productBarcodeAlias.findUnique({
    where: { barcode },
    include: { product: true },
  })
  return alias?.product ?? null
}

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error('BLOB_READ_WRITE_TOKEN missing')
  const files = fs.readdirSync(IMAGES_DIR).filter((f) => !f.startsWith('.'))
  console.log(`found ${files.length} files in import/images/`)

  let uploaded = 0, skippedHasImage = 0, notFound = 0, badFile = 0
  for (const file of files) {
    const ext = file.split('.').pop()?.toLowerCase()
    const barcode = file.slice(0, file.length - ext.length - 1).trim()
    const contentType = EXT_TYPE[ext]
    if (!contentType || !barcode) {
      console.log(`SKIP (bad name/type): ${file}`)
      badFile++
      continue
    }
    const full = path.join(IMAGES_DIR, file)
    const size = fs.statSync(full).size
    if (size === 0 || size > MAX_BYTES) {
      console.log(`SKIP (size ${(size / 1024 / 1024).toFixed(1)}MB, max 5MB): ${file}`)
      badFile++
      continue
    }
    const product = await findProductByBarcode(barcode)
    if (!product) {
      console.log(`SKIP (no product for barcode ${barcode}): ${file}`)
      notFound++
      continue
    }
    if (product.imagePath && !OVERWRITE) {
      console.log(`SKIP (already has image): ${product.name}`)
      skippedHasImage++
      continue
    }

    console.log(`UPLOAD: ${file} → ${product.name}`)
    if (APPLY) {
      const data = fs.readFileSync(full)
      const key = `products/${product.id}-${Date.now()}.${ext === 'jpeg' ? 'jpg' : ext}`
      const blob = await put(key, data, {
        access: 'public',
        contentType,
        allowOverwrite: true,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      })
      await prisma.product.update({ where: { id: product.id }, data: { imagePath: blob.url } })
    }
    uploaded++
  }

  console.log(`\n${APPLY ? 'DONE' : 'DRY RUN (add --apply to upload)'}: ` +
    `${uploaded} to upload, ${skippedHasImage} already have image, ${notFound} barcode not found, ${badFile} bad files`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
