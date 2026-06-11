import { renderMessage } from './render'
import type { NotificationDriver, NotificationEvent, NotificationRecipient } from './types'

/**
 * Console driver: logs every notification to stdout. Used in development.
 */
export class ConsoleDriver implements NotificationDriver {
  readonly name = 'console'

  async send(event: NotificationEvent, recipient: NotificationRecipient) {
    const body = renderMessage(event)
    console.log(
      `[Notify/${this.name}] → ${recipient.phone}${recipient.name ? ` (${recipient.name})` : ''}\n${body}\n`
    )
    return { success: true }
  }
}

/**
 * Mock driver: collects events in memory for testing.
 */
export class MockDriver implements NotificationDriver {
  readonly name = 'mock'
  readonly sent: Array<{ event: NotificationEvent; recipient: NotificationRecipient; body: string }> = []

  async send(event: NotificationEvent, recipient: NotificationRecipient) {
    this.sent.push({ event, recipient, body: renderMessage(event) })
    return { success: true }
  }

  clear() {
    this.sent.length = 0
  }
}
