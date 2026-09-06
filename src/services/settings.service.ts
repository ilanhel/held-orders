import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/** AppSetting key: WhatsApp destination for lit-frame / canvas-frame order lines. */
export const SPECIAL_FRAMES_PHONE_KEY = 'specialFramesPhone'

/**
 * SettingsService — admin-editable key/value settings stored in AppSetting.
 * Empty/blank values delete the row (setting cleared = feature off).
 */
export class SettingsService {
  static async get(key: string): Promise<string | null> {
    const row = await prisma.appSetting.findUnique({ where: { key } })
    return row?.value ?? null
  }

  static async set(key: string, value: string | null): Promise<void> {
    const v = value?.trim() ?? ''
    if (!v) {
      await prisma.appSetting.deleteMany({ where: { key } })
      return
    }
    await prisma.appSetting.upsert({
      where: { key },
      create: { key, value: v },
      update: { value: v },
    })
  }

  static async getSpecialFramesPhone(): Promise<string | null> {
    return this.get(SPECIAL_FRAMES_PHONE_KEY)
  }

  /**
   * Set the special-frames WhatsApp destination. Accepts an Israeli/intl phone
   * number or a WhatsApp chat id (e.g. a group "12036…@g.us"). Blank clears.
   * Throws 'INVALID_PHONE' for anything else.
   */
  static async setSpecialFramesPhone(value: string | null): Promise<void> {
    const v = value?.trim() ?? ''
    if (v && !v.includes('@') && !/^\+?\d{9,15}$/.test(v.replace(/[\s\-()]/g, ''))) {
      throw new Error('INVALID_PHONE')
    }
    await this.set(SPECIAL_FRAMES_PHONE_KEY, v || null)
  }
}
