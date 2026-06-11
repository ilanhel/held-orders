import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { requireSession } from '@/lib/session'
import { i18n } from '@/lib/i18n'

const prisma = new PrismaClient()

/**
 * GET /api/orders/[id]
 * Returns a single order. Franchisees can only access their own store's orders.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { authenticated, session, error } = await requireSession(req)
  if (!authenticated) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: i18n.errors.unauthorized } },
      { status: 401 }
    )
  }
  if (error === 'Forbidden') {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: i18n.errors.forbidden } },
      { status: 403 }
    )
  }

  const { id } = await ctx.params

  try {
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        store: true,
        items: { orderBy: { createdAt: 'asc' } },
      },
    })
    if (!order) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: i18n.errors.notFound } },
        { status: 404 }
      )
    }
    // Franchisees can only see their own store's orders
    if (session!.role === 'FRANCHISEE' && order.storeId !== session!.storeId) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: i18n.errors.forbidden } },
        { status: 403 }
      )
    }

    const totalAgorot = order.items.reduce(
      (s, i) => s + i.priceAgorot * i.qtyOrdered,
      0
    )
    return NextResponse.json({
      order: {
        id: order.id,
        number: order.number,
        storeId: order.storeId,
        storeName: order.store.name,
        status: order.status,
        submittedAt: order.submittedAt,
        createdAt: order.createdAt,
        items: order.items.map((i) => ({
          id: i.id,
          productId: i.productId,
          productName: i.productName,
          productBarcode: i.productBarcode,
          priceAgorot: i.priceAgorot,
          qtyOrdered: i.qtyOrdered,
          qtySupplied: i.qtySupplied,
          picked: i.picked,
        })),
        totalAgorot,
      },
    })
  } catch (err) {
    console.error('[api/orders/:id] error:', err)
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: i18n.errors.serverError } },
      { status: 500 }
    )
  }
}
