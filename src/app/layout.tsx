import type { Metadata, Viewport } from 'next'
import './globals.css'
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister'

export const metadata: Metadata = {
  title: 'HELD הזמנות',
  description: 'מערכת הזמנות זכיינים-מחסן',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ef4444',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="he" dir="rtl" data-scroll-behavior="smooth">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="x-ua-compatible" content="ie=edge" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icon.svg" />
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body className="bg-gray-50">
        <ServiceWorkerRegister />
        <div id="__next">{children}</div>
      </body>
    </html>
  )
}
