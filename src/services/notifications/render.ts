import { i18n } from '@/lib/i18n'
import { formatTotal } from '@/lib/format'
import type { NotificationEvent } from './types'

/**
 * Render a Hebrew message body for a domain event.
 * Used by all drivers (console, WhatsApp, etc.) so messages stay consistent.
 */
export function renderMessage(event: NotificationEvent): string {
  switch (event.type) {
    case 'ORDER_SUBMITTED':
      return `הזמנה #${event.orderNumber} מ-${event.storeName} התקבלה: ${event.itemCount} פריטים, ${formatTotal(event.totalAgorot)}.`
    case 'ORDER_RECEIVED':
      return `הזמנה #${event.orderNumber}: ${i18n.orders.statuses.RECEIVED}`
    case 'ORDER_PICKING':
      return `הזמנה #${event.orderNumber}: ${i18n.orders.statuses.PICKING}`
    case 'ORDER_READY':
      return `הזמנה #${event.orderNumber}: ${i18n.orders.statuses.READY}`
    case 'ORDER_SHIPPED':
      return `הזמנה #${event.orderNumber}: ${i18n.orders.statuses.SHIPPED}`
    case 'ORDER_CANCELLED':
      return `הזמנה #${event.orderNumber}: ${i18n.orders.statuses.CANCELLED}${event.reason ? ` — ${event.reason}` : ''}`
    case 'ORDER_SHORTAGES': {
      const lines = event.shortages.map(
        (s) => `• ${s.name}: הוזמן ${s.ordered}, סופק ${s.supplied}`
      )
      return `בהזמנה #${event.orderNumber} יש חוסרים:\n${lines.join('\n')}`
    }
    case 'PRODUCT_NEW':
      return `מוצר חדש בקטלוג: ${event.name} (${event.barcode}) — ${formatTotal(event.priceAgorot)}`
    case 'PRICE_CHANGED':
      return `מחיר עודכן: ${event.productName} — ${formatTotal(event.oldAgorot)} → ${formatTotal(event.newAgorot)}`
    case 'ANNOUNCEMENT':
      return `📢 ${event.title}\n${event.body}`
  }
}
