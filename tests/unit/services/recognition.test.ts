import { describe, it, expect } from 'vitest'
import { ClaudeVisionDriver } from '@/services/recognition/claude'
import type { RecognitionCandidate } from '@/services/recognition/types'

const candidates: RecognitionCandidate[] = [
  { productId: 'p1', name: 'בלוק עץ', barcode: '111' },
  { productId: 'p2', name: 'קנבס', barcode: '222' },
]

// parseMatches is private; exercise it via a tiny subclass that exposes it.
class TestDriver extends ClaudeVisionDriver {
  parse(text: string, limit = 3) {
    // @ts-expect-error access private for testing
    return this.parseMatches(text, candidates, limit)
  }
}

describe('ClaudeVisionDriver.parseMatches', () => {
  const d = new TestDriver()

  it('parses a clean JSON object', () => {
    const out = d.parse('{"matches":[{"productId":"p1","confidence":0.8}]}')
    expect(out).toEqual([{ productId: 'p1', confidence: 0.8 }])
  })

  it('extracts JSON embedded in surrounding prose', () => {
    const out = d.parse('הנה התוצאה: {"matches":[{"productId":"p2","confidence":0.5}]} בהצלחה')
    expect(out).toEqual([{ productId: 'p2', confidence: 0.5 }])
  })

  it('drops ids not in the candidate list', () => {
    const out = d.parse('{"matches":[{"productId":"ghost","confidence":0.9},{"productId":"p1","confidence":0.4}]}')
    expect(out).toEqual([{ productId: 'p1', confidence: 0.4 }])
  })

  it('clamps confidence to 0..1 and defaults missing to 0.5', () => {
    const out = d.parse('{"matches":[{"productId":"p1","confidence":2},{"productId":"p2"}]}')
    expect(out).toEqual([
      { productId: 'p1', confidence: 1 },
      { productId: 'p2', confidence: 0.5 },
    ])
  })

  it('returns [] for non-JSON or malformed output', () => {
    expect(d.parse('no json here')).toEqual([])
    expect(d.parse('{not valid')).toEqual([])
  })

  it('respects the limit', () => {
    const out = d.parse(
      '{"matches":[{"productId":"p1","confidence":0.9},{"productId":"p2","confidence":0.8}]}',
      1
    )
    expect(out).toHaveLength(1)
  })
})
