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

export interface AnnouncementAdminView {
  id: string
  title: string
  body: string
  requiresAck: boolean
  expiresAt: Date | null
  createdAt: Date
  ackCount: number
  recipientCount: number
}

export interface AnnouncementAckDetail {
  announcementId: string
  title: string
  requiresAck: boolean
  recipientCount: number
  acked: { userId: string; name: string; phone: string; ackedAt: Date }[]
  pending: { userId: string; name: string; phone: string }[]
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

  /**
   * List all announcements (including expired) for the management view, with
   * read-receipt counts against the current active-franchisee audience.
   * Admin/Warehouse only via API.
   */
  static async listForAdmin(): Promise<AnnouncementAdminView[]> {
    const [rows, recipientCount] = await Promise.all([
      prisma.announcement.findMany({
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { acks: true } } },
      }),
      prisma.user.count({ where: { role: Role.FRANCHISEE, active: true } }),
    ])
    return rows.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      requiresAck: a.requiresAck,
      expiresAt: a.expiresAt,
      createdAt: a.createdAt,
      ackCount: a._count.acks,
      recipientCount,
    }))
  }

  /**
   * Detailed read receipts for one announcement: who acknowledged (with time)
   * and which active franchisees have not yet. Throws 'ANNOUNCEMENT_NOT_FOUND'.
   */
  static async getAcks(announcementId: string): Promise<AnnouncementAckDetail> {
    const ann = await prisma.announcement.findUnique({
      where: { id: announcementId },
      select: { id: true, title: true, requiresAck: true },
    })
    if (!ann) throw new Error('ANNOUNCEMENT_NOT_FOUND')

    const [recipients, acks] = await Promise.all([
      prisma.user.findMany({
        where: { role: Role.FRANCHISEE, active: true },
        select: { id: true, name: true, phone: true },
        orderBy: { name: 'asc' },
      }),
      prisma.announcementAck.findMany({
        where: { announcementId },
        select: { userId: true, createdAt: true },
      }),
    ])

    const ackedAt = new Map(acks.map((a) => [a.userId, a.createdAt]))
    const acked: AnnouncementAckDetail['acked'] = []
    const pending: AnnouncementAckDetail['pending'] = []
    for (const r of recipients) {
      const at = ackedAt.get(r.id)
      if (at) acked.push({ userId: r.id, name: r.name, phone: r.phone, ackedAt: at })
      else pending.push({ userId: r.id, name: r.name, phone: r.phone })
    }
    acked.sort((a, b) => b.ackedAt.getTime() - a.ackedAt.getTime())

    return {
      announcementId: ann.id,
      title: ann.title,
      requiresAck: ann.requiresAck,
      recipientCount: recipients.length,
      acked,
      pending,
    }
  }
}
