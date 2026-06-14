import webpush from 'web-push'
import { PrismaClient } from '@prisma/client'
import { renderMessage } from './render'
import type { NotificationEvent } from './types'

const prisma = new PrismaClient()

/**
 * Web Push delivery. Complementary to the primary notification driver
 * (WhatsApp/console): looks up a user's stored browser subscriptions by phone
 * and pushes a short Hebrew notification to each.
 *
 * VAPID config (env):
 *   - VAPID_PUBLIC_KEY  / VAPID_PRIVATE_KEY  (required to send)
 *   - VAPID_SUBJECT     (mailto: or https: contact, defaults to a placeholder)
 *
 * Without keys the service is a no-op (push simply disabled in that env).
 */
class PushServiceImpl {
  private configured = false

  constructor() {
    this.configure()
  }

  /** (Re-)read VAPID env and arm the web-push library if keys are present. */
  configure(): void {
    const publicKey = process.env.VAPID_PUBLIC_KEY
    const privateKey = process.env.VAPID_PRIVATE_KEY
    const subject = process.env.VAPID_SUBJECT || 'mailto:dev@held.local'
    if (publicKey && privateKey) {
      try {
        webpush.setVapidDetails(subject, publicKey, privateKey)
        this.configured = true
      } catch {
        this.configured = false
      }
    } else {
      this.configured = false
    }
  }

  /** Whether push is available in this environment. */
  isConfigured(): boolean {
    return this.configured
  }

  /** The public VAPID key clients need to subscribe (null if unconfigured). */
  publicKey(): string | null {
    return process.env.VAPID_PUBLIC_KEY || null
  }

  /**
   * Send a push notification for an event to every browser the user (matched
   * by phone) has subscribed. Expired/invalid subscriptions (404/410) are
   * pruned. Never throws — failures are logged.
   */
  async sendToPhone(phone: string, event: NotificationEvent): Promise<void> {
    if (!this.configured) return

    const user = await prisma.user.findUnique({
      where: { phone },
      select: { id: true },
    })
    if (!user) return

    const subs = await prisma.pushSubscription.findMany({
      where: { userId: user.id },
    })
    if (subs.length === 0) return

    const payload = JSON.stringify({
      title: 'HELD',
      body: renderMessage(event),
      url: '/orders',
    })

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload
          )
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode
          if (statusCode === 404 || statusCode === 410) {
            await prisma.pushSubscription
              .delete({ where: { id: sub.id } })
              .catch(() => undefined)
          } else {
            console.error('[PushService] send failed:', statusCode ?? err)
          }
        }
      })
    )
  }
}

export const PushService = new PushServiceImpl()
