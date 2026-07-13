import { PrismaClient, OrderStatus, ProductStatus, Role } from '@prisma/client'
import { NotificationService } from './notifications'
import { CatalogService } from './catalog.service'
import { OrderExportService } from './export.service'
import type { NotificationEvent, NotificationRecipient } from './notifications/types'

const prisma = new PrismaClient()

/**
 * Allowed state transitions for an Order.
 * DRAFT → SUBMITTED happens via submitDraft() only.
 * All other transitions are warehouse-driven via transitionStatus().
 * CANCELLED is allowed from any non-terminal state.
 */
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: [OrderStatus.SUBMITTED, OrderStatus.CANCELLED],
  SUBMITTED: [OrderStatus.RECEIVED, OrderStatus.CANCELLED],
  RECEIVED: [OrderStatus.PICKING, OrderStatus.CANCELLED],
  PICKING: [OrderStatus.READY, OrderStatus.CANCELLED],
  READY: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  SHIPPED: [],
  CANCELLED: [],
}

const STATUS_EVENT_MAP: Partial<Record<OrderStatus, NotificationEvent['type']>> = {
  RECEIVED: 'ORDER_RECEIVED',
  PICKING: 'ORDER_PICKING',
  READY: 'ORDER_READY',
  SHIPPED: 'ORDER_SHIPPED',
}

export interface OrderItemView {
  id: string
  productId: string
  productName: string
  productBarcode: string
  priceAgorot: number
  qtyOrdered: number
  qtySupplied: number | null
  picked: boolean
}

export interface OrderView {
  id: string
  number: number | null
  storeId: string
  storeName: string
  status: OrderStatus
  submittedAt: Date | null
  createdAt: Date
  updatedAt: Date
  items: OrderItemView[]
  totalAgorot: number
}

export class OrderService {
  /**
   * Get the current DRAFT order for a store, creating one if it doesn't exist.
   * Each store has at most one DRAFT order at a time.
   */
  static async getOrCreateDraft(storeId: string, userId: string): Promise<OrderView> {
    let draft = await prisma.order.findFirst({
      where: { storeId, status: OrderStatus.DRAFT },
      include: {
        store: true,
        items: { orderBy: { createdAt: 'asc' } },
      },
    })

    if (!draft) {
      draft = await prisma.order.create({
        data: {
          storeId,
          createdBy: userId,
          status: OrderStatus.DRAFT,
        },
        include: {
          store: true,
          items: { orderBy: { createdAt: 'asc' } },
        },
      })
    }

    return this.toView(draft)
  }

  /**
   * Set the quantity for a product in a draft.
   * qty = 0 removes the item. qty > 0 upserts.
   * Throws if order isn't a DRAFT or product is HIDDEN.
   */
  static async setItemQty(
    orderId: string,
    productId: string,
    qty: number
  ): Promise<OrderView> {
    if (qty < 0 || !Number.isInteger(qty)) {
      throw new Error('INVALID_QTY')
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { store: true },
    })
    if (!order) throw new Error('ORDER_NOT_FOUND')
    if (order.status !== OrderStatus.DRAFT) throw new Error('ORDER_NOT_DRAFT')

    if (qty === 0) {
      await prisma.orderItem.deleteMany({
        where: { orderId, productId },
      })
    } else {
      const product = await prisma.product.findUnique({ where: { id: productId } })
      if (!product) throw new Error('PRODUCT_NOT_FOUND')
      if (product.status === ProductStatus.HIDDEN) throw new Error('PRODUCT_HIDDEN')

      await prisma.orderItem.upsert({
        where: { orderId_productId: { orderId, productId } },
        update: { qtyOrdered: qty },
        create: {
          orderId,
          productId,
          qtyOrdered: qty,
          priceAgorot: product.priceAgorot, // Snapshot — will be re-locked on submit
          productName: product.name,
          productBarcode: product.barcode,
        },
      })
    }

    const updated = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        store: true,
        items: { orderBy: { createdAt: 'asc' } },
      },
    })
    return this.toView(updated!)
  }

  /**
   * Submit a draft order: lock prices/names from current products, assign number,
   * transition DRAFT → SUBMITTED, record history.
   * Throws if order is empty or not a DRAFT.
   */
  static async submitDraft(orderId: string, userId: string): Promise<OrderView> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    })
    if (!order) throw new Error('ORDER_NOT_FOUND')
    if (order.status !== OrderStatus.DRAFT) throw new Error('ORDER_NOT_DRAFT')
    if (order.items.length === 0) throw new Error('ORDER_EMPTY')

    // Re-snapshot prices and names at submission time
    const productIds = order.items.map((i) => i.productId)
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
    })
    const productMap = new Map(products.map((p) => [p.id, p]))

    // Reject if any item references a HIDDEN product (catalog changed mid-edit)
    for (const item of order.items) {
      const p = productMap.get(item.productId)
      if (!p) throw new Error('PRODUCT_NOT_FOUND')
      if (p.status === ProductStatus.HIDDEN) throw new Error('PRODUCT_HIDDEN')
    }

    // Assign next order number atomically
    const lastOrder = await prisma.order.findFirst({
      where: { number: { gt: 0 } },
      orderBy: { number: 'desc' },
      select: { number: true },
    })
    const nextNumber = (lastOrder?.number ?? 1000) + 1

    await prisma.$transaction(async (tx) => {
      // Update each item's price/name from current product
      for (const item of order.items) {
        const p = productMap.get(item.productId)!
        await tx.orderItem.update({
          where: { id: item.id },
          data: {
            priceAgorot: p.priceAgorot,
            productName: p.name,
            productBarcode: p.barcode,
          },
        })
      }

      await tx.order.update({
        where: { id: orderId },
        data: {
          number: nextNumber,
          status: OrderStatus.SUBMITTED,
          submittedAt: new Date(),
        },
      })

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          from: OrderStatus.DRAFT,
          to: OrderStatus.SUBMITTED,
          byUserId: userId,
        },
      })
    })

    const submitted = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        store: true,
        items: { orderBy: { createdAt: 'asc' } },
      },
    })
    const view = this.toView(submitted!)

    // Notify warehouse staff of the new order
    if (view.number !== null) {
      const warehouseRecipients = await prisma.user.findMany({
        where: { role: Role.WAREHOUSE, active: true },
        select: { phone: true, name: true },
      })
      await NotificationService.broadcast(
        {
          type: 'ORDER_SUBMITTED',
          orderNumber: view.number,
          storeName: view.storeName,
          totalAgorot: view.totalAgorot,
          itemCount: view.items.length,
        },
        warehouseRecipients.map((u) => ({ phone: u.phone, name: u.name }))
      )
    }

    return view
  }

  /**
   * Get order history for a store (most recent first), excluding current DRAFT.
   */
  static async getStoreOrders(storeId: string, limit = 50): Promise<OrderView[]> {
    const orders = await prisma.order.findMany({
      where: { storeId, status: { not: OrderStatus.DRAFT } },
      orderBy: { submittedAt: 'desc' },
      take: limit,
      include: {
        store: true,
        items: { orderBy: { createdAt: 'asc' } },
      },
    })
    return orders.map((o) => this.toView(o))
  }

  /**
   * Copy the items of a previously submitted order into the store's current
   * DRAFT (creating one if needed). Each product's quantity in the draft is set
   * to the source order's quantity (overwriting an existing line for the same
   * product; other draft lines are kept). Items whose product is now HIDDEN or
   * deleted are skipped. Returns the resulting draft plus the skipped count.
   *
   * Throws 'ORDER_NOT_FOUND' / 'FORBIDDEN' (source belongs to another store).
   */
  static async reorder(
    sourceOrderId: string,
    storeId: string,
    userId: string
  ): Promise<{ draft: OrderView; skipped: number }> {
    const source = await prisma.order.findUnique({
      where: { id: sourceOrderId },
      include: { items: { orderBy: { createdAt: 'asc' } } },
    })
    if (!source) throw new Error('ORDER_NOT_FOUND')
    if (source.storeId !== storeId) throw new Error('FORBIDDEN')

    const draft = await this.getOrCreateDraft(storeId, userId)

    const productIds = source.items.map((i) => i.productId)
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
    })
    const productMap = new Map(products.map((p) => [p.id, p]))

    let skipped = 0
    for (const item of source.items) {
      const product = productMap.get(item.productId)
      if (!product || product.status === ProductStatus.HIDDEN) {
        skipped++
        continue
      }
      await prisma.orderItem.upsert({
        where: { orderId_productId: { orderId: draft.id, productId: item.productId } },
        update: { qtyOrdered: item.qtyOrdered },
        create: {
          orderId: draft.id,
          productId: item.productId,
          qtyOrdered: item.qtyOrdered,
          priceAgorot: product.priceAgorot,
          productName: product.name,
          productBarcode: product.barcode,
        },
      })
    }

    return { draft: (await this.getById(draft.id))!, skipped }
  }

  /**
   * Copy the store's most recent submitted order into its DRAFT ("my regular
   * order" / "order again"). Throws 'NO_PREVIOUS_ORDER' if none exists.
   */
  static async reorderLast(
    storeId: string,
    userId: string
  ): Promise<{ draft: OrderView; skipped: number }> {
    const last = await prisma.order.findFirst({
      where: { storeId, status: { not: OrderStatus.DRAFT } },
      orderBy: { submittedAt: 'desc' },
      select: { id: true },
    })
    if (!last) throw new Error('NO_PREVIOUS_ORDER')
    return this.reorder(last.id, storeId, userId)
  }

  /**
   * Warehouse queue: all non-DRAFT, non-terminal orders, oldest first.
   */
  static async getWarehouseQueue(limit = 100): Promise<OrderView[]> {
    const orders = await prisma.order.findMany({
      where: {
        status: {
          in: [
            OrderStatus.SUBMITTED,
            OrderStatus.RECEIVED,
            OrderStatus.PICKING,
            OrderStatus.READY,
          ],
        },
      },
      orderBy: { submittedAt: 'asc' },
      take: limit,
      include: {
        store: true,
        items: { orderBy: { createdAt: 'asc' } },
      },
    })
    return orders.map((o) => this.toView(o))
  }

  /**
   * Get a single order by id with full details.
   */
  static async getById(orderId: string): Promise<OrderView | null> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        store: true,
        items: { orderBy: { createdAt: 'asc' } },
      },
    })
    return order ? this.toView(order) : null
  }

  /**
   * Transition an order to a new status. Validates allowed transitions,
   * records history, and triggers a notification to the originating franchisees.
   */
  static async transitionStatus(
    orderId: string,
    to: OrderStatus,
    userId: string
  ): Promise<OrderView> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { store: true, items: { orderBy: { createdAt: 'asc' } } },
    })
    if (!order) throw new Error('ORDER_NOT_FOUND')

    const allowed = ALLOWED_TRANSITIONS[order.status] ?? []
    if (!allowed.includes(to)) throw new Error('INVALID_TRANSITION')

    const from = order.status

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: { status: to },
      })
      await tx.orderStatusHistory.create({
        data: { orderId, from, to, byUserId: userId },
      })
    })

    const updated = await prisma.order.findUnique({
      where: { id: orderId },
      include: { store: true, items: { orderBy: { createdAt: 'asc' } } },
    })
    const view = this.toView(updated!)

    // Decrement tracked inventory when the order ships (qtySupplied if known).
    if (to === OrderStatus.SHIPPED) {
      await CatalogService.decrementStockForShipment(
        view.items.map((i) => ({
          productId: i.productId,
          qty: i.qtySupplied ?? i.qtyOrdered,
        }))
      )
    }

    // Notify franchisees of the store
    const eventType = STATUS_EVENT_MAP[to]
    if (eventType && view.number !== null) {
      const recipients = await this.storeRecipients(view.storeId)
      if (to === OrderStatus.CANCELLED) {
        await NotificationService.broadcast(
          { type: 'ORDER_CANCELLED', orderNumber: view.number },
          recipients
        )
      } else {
        const evt = { type: eventType, orderNumber: view.number } as NotificationEvent
        await NotificationService.broadcast(evt, recipients)
      }
    } else if (to === OrderStatus.CANCELLED && view.number !== null) {
      const recipients = await this.storeRecipients(view.storeId)
      await NotificationService.broadcast(
        { type: 'ORDER_CANCELLED', orderNumber: view.number },
        recipients
      )
    }

    return view
  }

  /**
   * Set qtySupplied + picked flag for a single line during picking.
   * Allowed only in RECEIVED or PICKING states. qtySupplied must be 0..qtyOrdered.
   */
  static async updateItemSupply(
    orderId: string,
    itemId: string,
    qtySupplied: number,
    picked: boolean
  ): Promise<OrderView> {
    const order = await prisma.order.findUnique({ where: { id: orderId } })
    if (!order) throw new Error('ORDER_NOT_FOUND')
    if (
      order.status !== OrderStatus.RECEIVED &&
      order.status !== OrderStatus.PICKING
    ) {
      throw new Error('ORDER_NOT_PICKABLE')
    }

    const item = await prisma.orderItem.findUnique({ where: { id: itemId } })
    if (!item || item.orderId !== orderId) throw new Error('ITEM_NOT_FOUND')
    if (!Number.isInteger(qtySupplied) || qtySupplied < 0 || qtySupplied > item.qtyOrdered) {
      throw new Error('INVALID_QTY')
    }

    await prisma.orderItem.update({
      where: { id: itemId },
      data: { qtySupplied, picked },
    })

    return (await this.getById(orderId))!
  }

  /**
   * Notify franchisees about shortages in their order.
   * Computes the diff between qtyOrdered and qtySupplied for all items.
   * Throws if order has no shortages or no number.
   */
  static async notifyShortages(orderId: string): Promise<{ shortageCount: number }> {
    const order = await this.getById(orderId)
    if (!order) throw new Error('ORDER_NOT_FOUND')
    if (order.number === null) throw new Error('ORDER_NOT_SUBMITTED')

    const shortages = order.items
      .filter((i) => i.qtySupplied !== null && i.qtySupplied < i.qtyOrdered)
      .map((i) => ({
        name: i.productName,
        ordered: i.qtyOrdered,
        supplied: i.qtySupplied ?? 0,
      }))

    if (shortages.length === 0) return { shortageCount: 0 }

    const recipients = await this.storeRecipients(order.storeId)
    await NotificationService.broadcast(
      { type: 'ORDER_SHORTAGES', orderNumber: order.number, shortages },
      recipients
    )
    return { shortageCount: shortages.length }
  }

  /**
   * Send the ERP-intake data (barcode + supplied qty) to the preconfigured
   * ERP WhatsApp number (env ERP_INTAKE_PHONE) — as an XLSX file when the
   * driver supports it, otherwise as pasteable text lines.
   */
  static async sendErpIntake(orderId: string): Promise<{ sent: boolean }> {
    const order = await this.getById(orderId)
    if (!order) throw new Error('ORDER_NOT_FOUND')
    if (order.number === null) throw new Error('ORDER_NOT_SUBMITTED')

    const phone = process.env.ERP_INTAKE_PHONE
    if (!phone) throw new Error('ERP_PHONE_NOT_CONFIGURED')

    const lines = order.items.map((i) => ({
      barcode: i.productBarcode,
      qty: i.qtySupplied ?? i.qtyOrdered,
    }))

    const { buffer, filename } = await OrderExportService.buildOrderXlsx(orderId)

    await NotificationService.sendWithFile(
      { type: 'ORDER_ERP_INTAKE', orderNumber: order.number, storeName: order.storeName, lines },
      { phone, name: 'ERP' },
      {
        filename,
        buffer,
        caption: `קליטה ל-ERP — הזמנה #${order.number} (${order.storeName})`,
      }
    )
    return { sent: true }
  }

  /**
   * One-tap end of picking: notify the franchisee about shortages (if any)
   * and send the ERP-intake file to the preconfigured ERP number.
   */
  static async finishPicking(
    orderId: string
  ): Promise<{ shortageCount: number; erpSent: boolean }> {
    const { shortageCount } = await this.notifyShortages(orderId)
    const { sent } = await this.sendErpIntake(orderId)
    return { shortageCount, erpSent: sent }
  }

  private static async storeRecipients(storeId: string): Promise<NotificationRecipient[]> {
    const users = await prisma.user.findMany({
      where: { storeId, role: Role.FRANCHISEE, active: true },
      select: { phone: true, name: true },
    })
    return users.map((u) => ({ phone: u.phone, name: u.name }))
  }

  private static toView(order: {
    id: string
    number: number | null
    storeId: string
    store: { name: string }
    status: OrderStatus
    submittedAt: Date | null
    createdAt: Date
    updatedAt: Date
    items: {
      id: string
      productId: string
      productName: string
      productBarcode: string
      priceAgorot: number
      qtyOrdered: number
      qtySupplied: number | null
      picked: boolean
    }[]
  }): OrderView {
    return {
      id: order.id,
      number: order.number,
      storeId: order.storeId,
      storeName: order.store.name,
      status: order.status,
      submittedAt: order.submittedAt,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
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
      totalAgorot: order.items.reduce(
        (sum, i) => sum + i.priceAgorot * i.qtyOrdered,
        0
      ),
    }
  }
}
