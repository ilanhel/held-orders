import { renderMessage } from './render'
import type { NotificationDriver, NotificationEvent, NotificationFile, NotificationRecipient } from './types'

/**
 * Green API WhatsApp driver (https://green-api.com).
 * A simpler alternative to the Meta Cloud API — needs only an instance id and
 * token, no Meta business verification.
 *
 * Reads credentials from env:
 *   - GREEN_API_ID_INSTANCE     (the instance id, e.g. "1101000001")
 *   - GREEN_API_TOKEN_INSTANCE  (the instance API token)
 *   - GREEN_API_URL             (optional, defaults to https://api.green-api.com;
 *                                Green API may assign a per-instance host such as
 *                                https://1101.api.greenapi.com)
 *
 * Sends a plain text message. Israeli phones (05XXXXXXXX) are normalized to the
 * Green API chatId format (9725XXXXXXXX@c.us).
 *
 * If credentials are missing, send() returns success=false with a clear error
 * so the system stays functional in development without silently dropping
 * messages.
 */
export class GreenApiDriver implements NotificationDriver {
  readonly name = 'green-api'

  private get idInstance(): string | undefined {
    return process.env.GREEN_API_ID_INSTANCE || undefined
  }

  private get apiToken(): string | undefined {
    return process.env.GREEN_API_TOKEN_INSTANCE || undefined
  }

  private get apiUrl(): string {
    return (process.env.GREEN_API_URL || 'https://api.green-api.com').replace(/\/+$/, '')
  }

  /**
   * Normalize an Israeli mobile number (05XXXXXXXX) to a Green API chatId
   * (9725XXXXXXXX@c.us). Already-international numbers are passed through.
   */
  static toChatId(phone: string): string {
    const digits = phone.replace(/\D/g, '')
    let intl: string
    if (digits.startsWith('972')) intl = digits
    else if (digits.startsWith('0')) intl = '972' + digits.slice(1)
    else intl = digits
    return `${intl}@c.us`
  }

  async send(event: NotificationEvent, recipient: NotificationRecipient) {
    const body = renderMessage(event)

    if (!this.idInstance || !this.apiToken) {
      return {
        success: false,
        error: 'GREEN_API_NOT_CONFIGURED',
      }
    }

    const chatId = GreenApiDriver.toChatId(recipient.phone)
    const url = `${this.apiUrl}/waInstance${this.idInstance}/sendMessage/${this.apiToken}`

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, message: body }),
      })

      if (!res.ok) {
        let detail = ''
        try {
          const data = await res.json()
          detail = data?.error || JSON.stringify(data)
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

  /**
   * Deliver a file (e.g. the picking XLSX) via Green API sendFileByUpload.
   * Sent as multipart/form-data; caption appears with the file in WhatsApp.
   */
  async sendFile(file: NotificationFile, recipient: NotificationRecipient) {
    if (!this.idInstance || !this.apiToken) {
      return { success: false, error: 'GREEN_API_NOT_CONFIGURED' }
    }

    const chatId = GreenApiDriver.toChatId(recipient.phone)
    const url = `${this.apiUrl}/waInstance${this.idInstance}/sendFileByUpload/${this.apiToken}`

    const form = new FormData()
    form.append('chatId', chatId)
    form.append('fileName', file.filename)
    if (file.caption) form.append('caption', file.caption)
    form.append(
      'file',
      new Blob([new Uint8Array(file.buffer)], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      file.filename
    )

    try {
      const res = await fetch(url, { method: 'POST', body: form })
      if (!res.ok) {
        let detail = ''
        try {
          const data = await res.json()
          detail = data?.error || JSON.stringify(data)
        } catch {
          detail = await res.text().catch(() => '')
        }
        return { success: false, error: `HTTP ${res.status}: ${detail.slice(0, 200)}` }
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
