import type {
  RecognitionDriver,
  RecognitionCandidate,
  RecognitionImage,
  RecognitionMatch,
} from './types'

/**
 * Mock recognition driver — deterministic, no network. Used in dev/tests when
 * no vision provider is configured. Returns the first `limit` candidates with
 * descending synthetic confidence so the UI/flow can be exercised end-to-end.
 *
 * A test can override `next` to control the returned matches.
 */
export class MockRecognitionDriver implements RecognitionDriver {
  readonly name = 'mock'
  next: RecognitionMatch[] | null = null

  async recognize(
    _image: RecognitionImage,
    candidates: RecognitionCandidate[],
    limit: number
  ): Promise<RecognitionMatch[]> {
    if (this.next) return this.next.slice(0, limit)
    return candidates.slice(0, limit).map((c, i) => ({
      productId: c.productId,
      confidence: Math.max(0.1, 0.9 - i * 0.25),
    }))
  }
}
