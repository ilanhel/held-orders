import { PrismaClient, ProductStatus } from '@prisma/client'
import type { CatalogProduct } from '../catalog.service'
import { CatalogService } from '../catalog.service'
import { MockRecognitionDriver } from './mock'
import { ClaudeVisionDriver } from './claude'
import type { RecognitionDriver, RecognitionImage } from './types'

const prisma = new PrismaClient()

const MAX_MATCHES = 3
const MAX_CANDIDATES = 200

export interface RecognitionResult {
  product: CatalogProduct
  confidence: number
}

/**
 * ProductRecognitionService — turns a captured photo into catalog products.
 *
 * Driver selection (env RECOGNITION_DRIVER):
 *   - "mock"   → deterministic MockRecognitionDriver (dev/tests)
 *   - "claude" → ClaudeVisionDriver (requires ANTHROPIC_API_KEY)
 *   - default  → "claude" if ANTHROPIC_API_KEY is set, else "mock"
 */
class ProductRecognitionServiceImpl {
  private driver: RecognitionDriver
  readonly mock = new MockRecognitionDriver()

  constructor() {
    this.driver = this.resolveDriver()
  }

  private resolveDriver(): RecognitionDriver {
    const name = (process.env.RECOGNITION_DRIVER || '').toLowerCase()
    if (name === 'mock') return this.mock
    if (name === 'claude') return new ClaudeVisionDriver()
    return process.env.ANTHROPIC_API_KEY ? new ClaudeVisionDriver() : this.mock
  }

  /** Override the active driver (used by tests). */
  setDriver(driver: RecognitionDriver) {
    this.driver = driver
  }

  reloadFromEnv() {
    this.driver = this.resolveDriver()
  }

  get driverName(): string {
    return this.driver.name
  }

  /**
   * Recognize products in a photo. Returns up to 3 matches ordered by
   * confidence, each resolved to a full catalog product (ACTIVE/OUT_OF_STOCK
   * only — HIDDEN products are never candidates and never returned).
   */
  async recognize(image: RecognitionImage): Promise<RecognitionResult[]> {
    const products = await prisma.product.findMany({
      where: { status: { not: ProductStatus.HIDDEN } },
      select: { id: true, name: true, barcode: true },
      take: MAX_CANDIDATES,
      orderBy: { name: 'asc' },
    })
    if (products.length === 0) return []

    const candidates = products.map((p) => ({
      productId: p.id,
      name: p.name,
      barcode: p.barcode,
    }))

    const matches = await this.driver.recognize(image, candidates, MAX_MATCHES)
    if (matches.length === 0) return []

    // Resolve to full products, preserving match order, dropping any that are
    // no longer visible.
    const ordered = [...matches].sort((a, b) => b.confidence - a.confidence)
    const results: RecognitionResult[] = []
    for (const m of ordered) {
      const product = await CatalogService.getById(m.productId)
      if (product) results.push({ product, confidence: m.confidence })
    }
    return results
  }
}

export const ProductRecognitionService = new ProductRecognitionServiceImpl()
export type {
  RecognitionDriver,
  RecognitionMatch,
  RecognitionImage,
  RecognitionCandidate,
} from './types'
