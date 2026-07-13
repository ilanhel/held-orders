/**
 * Domain events emitted by services that may trigger a notification.
 * Drivers map these to specific channel templates (WhatsApp, console, etc.).
 */
export type NotificationEvent =
  | { type: 'ORDER_SUBMITTED'; orderNumber: number; storeName: string; totalAgorot: number; itemCount: number }
  | { type: 'ORDER_RECEIVED'; orderNumber: number }
  | { type: 'ORDER_PICKING'; orderNumber: number }
  | { type: 'ORDER_READY'; orderNumber: number }
  | { type: 'ORDER_SHIPPED'; orderNumber: number }
  | { type: 'ORDER_CANCELLED'; orderNumber: number; reason?: string }
  | { type: 'ORDER_SHORTAGES'; orderNumber: number; shortages: Array<{ name: string; ordered: number; supplied: number }> }
  | { type: 'PRODUCT_NEW'; name: string; barcode: string; priceAgorot: number }
  | { type: 'PRICE_CHANGED'; productName: string; oldAgorot: number; newAgorot: number }
  | { type: 'ANNOUNCEMENT'; title: string; body: string }
  | { type: 'OTP_CODE'; code: string; expiryMinutes: number }
  | { type: 'ORDER_ERP_INTAKE'; orderNumber: number; storeName: string; lines: Array<{ barcode: string; qty: number }> }

export interface NotificationRecipient {
  phone: string
  name?: string
}

/** A file attachment (e.g. XLSX) to deliver alongside/instead of a text message. */
export interface NotificationFile {
  filename: string
  buffer: Buffer
  caption?: string
}

export interface NotificationDriver {
  readonly name: string
  send(event: NotificationEvent, recipient: NotificationRecipient): Promise<{ success: boolean; error?: string }>
  /** Optional: deliver a file. Drivers without file support omit this. */
  sendFile?(file: NotificationFile, recipient: NotificationRecipient): Promise<{ success: boolean; error?: string }>
}
