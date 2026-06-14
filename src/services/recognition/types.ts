/**
 * Product image recognition (Phase B).
 *
 * A driver receives a captured photo plus the list of candidate products
 * (name + barcode) and returns up to N best matches with a confidence score.
 * Drivers must NOT call the database — the service layer supplies candidates
 * and maps results back to full products.
 */
export interface RecognitionCandidate {
  productId: string
  name: string
  barcode: string
}

export interface RecognitionMatch {
  productId: string
  confidence: number // 0..1
}

export interface RecognitionImage {
  /** Base64-encoded image data (no data: prefix). */
  base64: string
  /** MIME type, e.g. "image/jpeg". */
  mimeType: string
}

export interface RecognitionDriver {
  readonly name: string
  recognize(
    image: RecognitionImage,
    candidates: RecognitionCandidate[],
    limit: number
  ): Promise<RecognitionMatch[]>
}
