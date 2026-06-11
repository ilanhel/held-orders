import { renderMessage } from './render'
import type { NotificationDriver, NotificationEvent, NotificationRecipient } from './types'

/**
 * WhatsApp Cloud API driver.
 * Reads credentials from env:
 *   - WHATSAPP_PHONE_NUMBER_ID (the sender phone-number id)
 *   - WHATSAPP_BEARER_TOKEN    (Meta access token)
 *   - WHATSAPP_API_VERSION     (optional, defaults to v20.0)
 *
 * Sends a plain "text" message with the body rendered from the event.
 * Israeli phones (05XXXXXXXX) are normalized to E.164 (+9725XXXXXXXX).
 *
 * If credentials are missing, send() returns success=false with a clear
 * error — useful so the system stays functional during development without
 * silently dropping messages.
 */
export class WhatsAppDriver implements NotificationDriver {
  readonly name = 'whatsapp'

  private get phoneNumberId(): string | undefined {
    return process.env.WHATSAPP_PHONE_NUMBER_ID || undefined
  }

  private get token(): string | undefined {
    return process.env.WHATSAPP_BEARER_TOKEN || undefined
  }

  private get apiVersion(): string {
    return process.env.WHATSAPP_API_VERSION || 'v20.0'
  }

  /**
   * Normalize an Israeli mobile number (05XXXXXXXX) to E.164 (9725XXXXXXXX, no +).
   * Already-international numbers are passed through (strip non-digits).
   */
  static normalizePhone(phone: string): string {
    const digits = phone.replace(/\D/g, '')
    if (digits.startsWith('972')) return digits
    if (digits.startsWith('0')) return '972' + digits.slice(1)
    return digits
  }

  async send(event: NotificationEvent, recipient: NotificationRecipient) {
    const body = renderMessage(event)

    if (!this.phoneNumberId || !this.token) {
      return {
        success: false,
        error: 'WHATSAPP_NOT_CONFIGURED',
      }
    }

    const to = WhatsAppDriver.normalizePhone(recipient.phone)
    const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body, preview_url: false },
        }),
      })

      if (!res.ok) {
        let detail = ''
        try {
          const data = await res.json()
          detail = data?.error?.message || JSON.stringify(data)
        } catch {
          detail = await res.text().catch(() => '')
        }
        return {
          success: false,
          error: `HTTP ${res.status}: ${detail.slice(0, 200)}`,
        }
      }

      return { success: true }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }
}
