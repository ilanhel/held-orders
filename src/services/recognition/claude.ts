import type {
  RecognitionDriver,
  RecognitionCandidate,
  RecognitionImage,
  RecognitionMatch,
} from './types'

/**
 * Claude Vision recognition driver.
 *
 * Sends the captured photo together with the catalog candidate list to the
 * Anthropic Messages API and asks the model to return the best matching
 * products as strict JSON. Requires ANTHROPIC_API_KEY. The model only ever
 * chooses from the supplied candidate ids — it never invents products.
 *
 * Env:
 *   - ANTHROPIC_API_KEY   (required)
 *   - ANTHROPIC_MODEL     (optional, default "claude-3-5-sonnet-latest")
 */
export class ClaudeVisionDriver implements RecognitionDriver {
  readonly name = 'claude'

  private get apiKey(): string | undefined {
    return process.env.ANTHROPIC_API_KEY || undefined
  }

  private get model(): string {
    return process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest'
  }

  async recognize(
    image: RecognitionImage,
    candidates: RecognitionCandidate[],
    limit: number
  ): Promise<RecognitionMatch[]> {
    if (!this.apiKey) throw new Error('RECOGNITION_NOT_CONFIGURED')
    if (candidates.length === 0) return []

    const catalogText = candidates
      .map((c) => `${c.productId}\t${c.name}\t${c.barcode}`)
      .join('\n')

    const prompt =
      `אתה מזהה מוצרים של רשת מתנות לפי תמונה. להלן רשימת המוצרים בקטלוג ` +
      `בפורמט "productId<TAB>שם<TAB>ברקוד":\n${catalogText}\n\n` +
      `התבונן בתמונה והחזר עד ${limit} המוצרים התואמים ביותר. ` +
      `החזר JSON תקין בלבד, ללא טקסט נוסף, במבנה: ` +
      `{"matches":[{"productId":"<id מהרשימה בלבד>","confidence":<0..1>}]}. ` +
      `אם אין התאמה סבירה החזר {"matches":[]}.`

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 512,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: image.mimeType,
                  data: image.base64,
                },
              },
              { type: 'text', text: prompt },
            ],
          },
        ],
      }),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`RECOGNITION_PROVIDER_ERROR:${res.status}:${detail.slice(0, 200)}`)
    }

    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>
    }
    const text = data.content?.find((c) => c.type === 'text')?.text ?? ''
    return this.parseMatches(text, candidates, limit)
  }

  /** Extract the JSON object from the model's reply and validate ids. */
  private parseMatches(
    text: string,
    candidates: RecognitionCandidate[],
    limit: number
  ): RecognitionMatch[] {
    const valid = new Set(candidates.map((c) => c.productId))
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start === -1 || end === -1 || end < start) return []

    let parsed: unknown
    try {
      parsed = JSON.parse(text.slice(start, end + 1))
    } catch {
      return []
    }

    const matches = (parsed as { matches?: unknown }).matches
    if (!Array.isArray(matches)) return []

    return matches
      .filter(
        (m): m is { productId: string; confidence: number } =>
          !!m &&
          typeof (m as { productId?: unknown }).productId === 'string' &&
          valid.has((m as { productId: string }).productId)
      )
      .map((m) => ({
        productId: m.productId,
        confidence:
          typeof m.confidence === 'number'
            ? Math.max(0, Math.min(1, m.confidence))
            : 0.5,
      }))
      .slice(0, limit)
  }
}
