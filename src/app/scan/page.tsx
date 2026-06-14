'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { i18n } from '@/lib/i18n'
import { formatPrice } from '@/lib/format'

// Minimal typing for the (experimental) BarcodeDetector API.
type DetectedBarcode = { rawValue: string }
type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>
}
declare global {
  interface Window {
    BarcodeDetector?: {
      new (opts?: { formats?: string[] }): BarcodeDetectorLike
      getSupportedFormats?: () => Promise<string[]>
    }
  }
}

type Product = {
  id: string
  name: string
  barcode: string
  priceAgorot: number
  status: string
}
type Match = { product: Product; confidence: number }
type Mode = 'barcode' | 'photo'

export default function ScanPage() {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanLoop = useRef<number | null>(null)
  const draftQty = useRef<Map<string, number>>(new Map())

  const [mode, setMode] = useState<Mode>('barcode')
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [barcodeSupported, setBarcodeSupported] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [matches, setMatches] = useState<Match[] | null>(null)
  const [busyAdd, setBusyAdd] = useState<string | null>(null)

  // Load current draft quantities so "add" increments rather than overwrites.
  useEffect(() => {
    fetch('/api/orders/draft')
      .then((r) => (r.status === 401 ? (router.push('/login'), null) : r.json()))
      .then((d) => {
        if (!d?.order) return
        const m = new Map<string, number>()
        for (const it of d.order.items) m.set(it.productId, it.qtyOrdered)
        draftQty.current = m
      })
      .catch(() => {})
  }, [router])

  const stopCamera = useCallback(() => {
    if (scanLoop.current) {
      cancelAnimationFrame(scanLoop.current)
      scanLoop.current = null
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }, [])

  const addToCart = useCallback(
    async (product: Product) => {
      setBusyAdd(product.id)
      try {
        const nextQty = (draftQty.current.get(product.id) ?? 0) + 1
        const res = await fetch('/api/orders/draft/items', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId: product.id, qty: nextQty }),
        })
        if (res.status === 401) {
          router.push('/login')
          return
        }
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          showToast(data?.error?.message ?? i18n.errors.serverError)
          return
        }
        draftQty.current.set(product.id, nextQty)
        showToast(`${product.name} — ${i18n.scan.addedToCart} (${nextQty})`)
      } catch {
        showToast(i18n.errors.network)
      } finally {
        setBusyAdd(null)
      }
    },
    [router, showToast]
  )

  const onBarcode = useCallback(
    async (raw: string) => {
      // Pause scanning while we resolve the lookup.
      if (scanLoop.current) {
        cancelAnimationFrame(scanLoop.current)
        scanLoop.current = null
      }
      try {
        const res = await fetch(`/api/catalog/barcode/${encodeURIComponent(raw)}`)
        if (res.status === 401) {
          router.push('/login')
          return
        }
        if (res.status === 404) {
          showToast(i18n.scan.barcodeNotFound)
        } else {
          const data = await res.json()
          if (data.product) await addToCart(data.product)
        }
      } catch {
        showToast(i18n.errors.network)
      }
    },
    [addToCart, router, showToast]
  )

  // Start camera + (for barcode mode) the detection loop.
  useEffect(() => {
    let cancelled = false
    setError(null)
    setMatches(null)

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(i18n.scan.cameraUnavailable)
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
      } catch {
        setError(i18n.scan.cameraDenied)
        return
      }

      if (mode === 'barcode') {
        if (!window.BarcodeDetector) {
          setBarcodeSupported(false)
          return
        }
        setBarcodeSupported(true)
        const detector = new window.BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'code_128', 'upc_a', 'upc_e', 'code_39'],
        })
        let last = ''
        let lastTime = 0
        const tick = async () => {
          if (cancelled || !videoRef.current) return
          try {
            const found = await detector.detect(videoRef.current)
            const now = Date.now()
            if (found[0] && (found[0].rawValue !== last || now - lastTime > 2500)) {
              last = found[0].rawValue
              lastTime = now
              void onBarcode(found[0].rawValue)
            }
          } catch {
            // transient detect errors are ignored
          }
          if (!cancelled) scanLoop.current = requestAnimationFrame(tick)
        }
        scanLoop.current = requestAnimationFrame(tick)
      }
    }

    void start()
    return () => {
      cancelled = true
      stopCamera()
    }
  }, [mode, onBarcode, stopCamera])

  async function capturePhoto() {
    const video = videoRef.current
    if (!video) return
    setAnalyzing(true)
    setMatches(null)
    setError(null)
    try {
      const canvas = document.createElement('canvas')
      const maxW = 1024
      const scale = Math.min(1, maxW / (video.videoWidth || maxW))
      canvas.width = Math.round((video.videoWidth || maxW) * scale)
      canvas.height = Math.round((video.videoHeight || maxW) * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('no-ctx')
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
      const base64 = dataUrl.split(',')[1] ?? ''

      const res = await fetch('/api/recognize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mimeType: 'image/jpeg' }),
      })
      if (res.status === 401) {
        router.push('/login')
        return
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error?.message ?? i18n.errors.serverError)
        return
      }
      setMatches(data.matches ?? [])
    } catch {
      setError(i18n.errors.network)
    } finally {
      setAnalyzing(false)
    }
  }

  function switchMode(m: Mode) {
    if (m === mode) return
    setMatches(null)
    setError(null)
    setMode(m)
  }

  return (
    <main className="min-h-screen bg-gray-900 text-white flex flex-col">
      <header className="bg-gray-900/95 px-4 py-3 flex items-center gap-3 border-b border-gray-700">
        <button onClick={() => router.push('/catalog')} className="text-gray-300 text-sm">
          → {i18n.common.back}
        </button>
        <h1 className="text-lg font-bold flex-1 text-center">{i18n.scan.title}</h1>
        <span className="w-12" />
      </header>

      <div className="flex gap-2 p-3 bg-gray-900">
        <button
          onClick={() => switchMode('barcode')}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold ${
            mode === 'barcode' ? 'bg-primary text-white' : 'bg-gray-800 text-gray-300'
          }`}
        >
          🔳 {i18n.scan.tabBarcode}
        </button>
        <button
          onClick={() => switchMode('photo')}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold ${
            mode === 'photo' ? 'bg-primary text-white' : 'bg-gray-800 text-gray-300'
          }`}
        >
          📷 {i18n.scan.tabPhoto}
        </button>
      </div>

      <div className="relative flex-1 flex items-center justify-center bg-black overflow-hidden">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={videoRef}
          playsInline
          muted
          className="w-full h-full object-cover"
        />
        {mode === 'barcode' && barcodeSupported && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-64 h-40 border-2 border-primary rounded-xl" />
          </div>
        )}
        {mode === 'barcode' && (
          <p className="absolute bottom-4 inset-x-0 text-center text-sm text-white/90 px-4">
            {barcodeSupported ? i18n.scan.pointBarcode : i18n.scan.barcodeUnsupported}
          </p>
        )}
      </div>

      {error && (
        <div className="bg-red-600/90 text-white text-sm text-center px-4 py-2">{error}</div>
      )}
      {toast && (
        <div className="bg-green-600/90 text-white text-sm text-center px-4 py-2">{toast}</div>
      )}

      {mode === 'photo' && (
        <div className="bg-gray-900 p-4">
          {!matches && (
            <button
              onClick={capturePhoto}
              disabled={analyzing}
              className="w-full bg-primary text-white rounded-xl py-3 font-bold disabled:opacity-60"
            >
              {analyzing ? i18n.scan.analyzing : i18n.scan.capture}
            </button>
          )}

          {matches && matches.length === 0 && (
            <div className="text-center">
              <p className="text-gray-300 mb-3">{i18n.scan.noMatch}</p>
              <button
                onClick={() => setMatches(null)}
                className="bg-gray-700 text-white rounded-lg px-5 py-2"
              >
                {i18n.scan.retake}
              </button>
            </div>
          )}

          {matches && matches.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-300 mb-2">
                {i18n.scan.matchesTitle}
              </h2>
              <ul className="space-y-2">
                {matches.map((m) => (
                  <li
                    key={m.product.id}
                    className="bg-gray-800 rounded-xl p-3 flex items-center gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate">{m.product.name}</div>
                      <div className="text-xs text-gray-400" dir="ltr">
                        {m.product.barcode} · {formatPrice(m.product.priceAgorot)}
                      </div>
                      <div className="text-xs text-primary mt-0.5">
                        {i18n.scan.confidence}: {Math.round(m.confidence * 100)}%
                      </div>
                    </div>
                    <button
                      onClick={() => addToCart(m.product)}
                      disabled={busyAdd === m.product.id}
                      className="bg-primary text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60 flex-shrink-0"
                    >
                      {i18n.scan.addOne}
                    </button>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => setMatches(null)}
                className="w-full mt-3 bg-gray-700 text-white rounded-lg py-2 text-sm"
              >
                {i18n.scan.retake}
              </button>
            </div>
          )}
        </div>
      )}
    </main>
  )
}
