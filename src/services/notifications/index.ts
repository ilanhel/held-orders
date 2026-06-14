import { PrismaClient } from '@prisma/client'
import { ConsoleDriver, MockDriver } from './drivers'
import { WhatsAppDriver } from './whatsapp'
import { PushService } from './push'
import { renderMessage } from './render'
import type { NotificationDriver, NotificationEvent, NotificationRecipient } from './types'

const prisma = new PrismaClient()

/**
 * NotificationService — single entry point for sending domain notifications.
 * Routes through a pluggable driver, logs every attempt to NotificationLog.
 *
 * Driver selection (env NOTIFICATION_DRIVER):
 *   - "mock"     → in-memory MockDriver (tests)
 *   - "whatsapp" → WhatsApp Cloud API (requires WHATSAPP_PHONE_NUMBER_ID + WHATSAPP_BEARER_TOKEN)
 *   - default    → ConsoleDriver (dev)
 */
class NotificationServiceImpl {
  private driver: NotificationDriver
  readonly mock = new MockDriver()

  constructor() {
    this.driver = this.resolveDriver()
  }

  private resolveDriver(): NotificationDriver {
    const name = (process.env.NOTIFICATION_DRIVER || '').toLowerCase()
    if (name === 'mock') return this.mock
    if (name === 'whatsapp') return new WhatsAppDriver()
    return new ConsoleDriver()
  }

  /** Override the active driver (used by tests). */
  setDriver(driver: NotificationDriver) {
    this.driver = driver
  }

  /** Re-read NOTIFICATION_DRIVER env (used after tests set process.env). */
  reloadFromEnv() {
    this.driver = this.resolveDriver()
  }

  /**
   * Send a notification to a recipient and persist a NotificationLog entry.
   * Errors from the driver are swallowed — the log captures success/failure.
   */
  async send(event: NotificationEvent, recipient: NotificationRecipient): Promise<void> {
    let success = false
    let error: string | undefined
    try {
      const result = await this.driver.send(event, recipient)
      success = result.success
      error = result.error
    } catch (e) {
      success = false
      error = e instanceof Error ? e.message : String(e)
    }

    try {
      await prisma.notificationLog.create({
        data: {
          event: event.type,
          channel: this.driver.name,
          toPhone: recipient.phone,
          payload: JSON.stringify({ event, body: renderMessage(event), error }),
          success,
        },
      })
    } catch (e) {
      console.error('[NotificationService] failed to log:', e)
    }

    // Additionally deliver via Web Push to any browsers this recipient has
    // subscribed (no-op when VAPID is not configured). Never blocks the result.
    try {
      await PushService.sendToPhone(recipient.phone, event)
    } catch (e) {
      console.error('[NotificationService] push delivery failed:', e)
    }
  }

  /** Fan out the same event to multiple recipients. */
  async broadcast(event: NotificationEvent, recipients: NotificationRecipient[]): Promise<void> {
    await Promise.all(recipients.map((r) => this.send(event, r)))
  }
}

export const NotificationService = new NotificationServiceImpl()
export type { NotificationDriver, NotificationEvent, NotificationRecipient } from './types'
