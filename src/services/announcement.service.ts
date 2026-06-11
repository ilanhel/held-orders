import { PrismaClient, Role } from '@prisma/client'
import { NotificationService } from './notifications'

const prisma = new PrismaClient()

export interface AnnouncementView {
  id: string
  title: string
  body: string
  requiresAck: boolean
  expiresAt: Date | null
  createdAt: Date
  ackedByMe: boolean
}

export class AnnouncementService {
  /**
   * List active announcements (not expired) for a given user, marking which
   * are already acked by them.
   */
  static async listForUser(userId: string): Promise<AnnouncementView[]> {
    const now = new Date()
    const rows = await prisma.announcement.findMany({
      where: {
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        acks: { where: { userId }, select: { id: true } },
      },
    })
    return rows.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      requiresAck: a.requiresAck,
      expiresAt: a.expiresAt,
      createdAt: a.createdAt,
      ackedByMe: a.acks.length > 0,
    }))
  }

  /**
   * Create a new announcement and broadcast it to all active franchisees.
   * Admin/Warehouse-only via API.
   */
  static async create(input: {
    title: string
    body: string
    requiresAck?: boolean
    expiresAt?: Date | null
  }): Promise<AnnouncementView> {
    const ann = await prisma.announcement.create({
      data: {
        title: input.title.trim(),
        body: input.body.trim(),
        requiresAck: input.requiresAck ?? false,
        expiresAt: input.expiresAt ?? null,
      },
    })

    // Broadcast to all active franchisees
    const recipients = await prisma.user.findMany({
      where: { role: Role.FRANCHISEE, active: true },
      select: { phone: true, name: true },
    })
    await NotificationService.broadcast(
      { type: 'ANNOUNCEMENT', title: ann.title, body: ann.body },
      recipients.map((u) => ({ phone: u.phone, name: u.name }))
    )

    return {
      id: ann.id,
      title: ann.title,
      body: ann.body,
      requiresAck: ann.requiresAck,
      expiresAt: ann.expiresAt,
      createdAt: ann.createdAt,
      ackedByMe: false,
    }
  }

  /**
   * Record an ack for the given user on a specific announcement.
   * Idempotent.
   */
  static async ack(announcementId: string, userId: string): Promise<void> {
    await prisma.announcementAck.upsert({
      where: { announcementId_userId: { announcementId, userId } },
      update: {},
      create: { announcementId, userId },
    })
  }
}
