import { PrismaClient, Role, ProductStatus } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // Clear existing data
  await prisma.notificationLog.deleteMany()
  await prisma.announcementAck.deleteMany()
  await prisma.announcement.deleteMany()
  await prisma.orderStatusHistory.deleteMany()
  await prisma.orderItem.deleteMany()
  await prisma.order.deleteMany()
  await prisma.priceChange.deleteMany()
  await prisma.product.deleteMany()
  await prisma.category.deleteMany()
  await prisma.user.deleteMany()
  await prisma.store.deleteMany()

  // Create stores
  const store1 = await prisma.store.create({
    data: {
      name: 'HELD עזריאלי ת"א',
      code: 'AZR-TLV',
      phone: '0550000001',
      active: true,
    },
  })

  const store2 = await prisma.store.create({
    data: {
      name: 'HELD גרנד קניון חיפה',
      code: 'GRD-HFA',
      phone: '0550000002',
      active: true,
    },
  })

  // Create users
  const franchisee1 = await prisma.user.create({
    data: {
      name: 'דן צדיק',
      phone: '0550000001',
      role: Role.FRANCHISEE,
      storeId: store1.id,
      active: true,
    },
  })

  const franchisee2 = await prisma.user.create({
    data: {
      name: 'רות לוי',
      phone: '0550000002',
      role: Role.FRANCHISEE,
      storeId: store2.id,
      active: true,
    },
  })

  const warehouse = await prisma.user.create({
    data: {
      name: 'יוסי כהן',
      phone: '0550000003',
      role: Role.WAREHOUSE,
      active: true,
    },
  })

  const admin = await prisma.user.create({
    data: {
      name: 'מנהל HELD',
      phone: '0550000004',
      role: Role.ADMIN,
      active: true,
    },
  })

  // Create categories
  const categories = [
    { name: 'בלוקים מעץ', sortOrder: 10 },
    { name: 'קנבסים', sortOrder: 20 },
    { name: 'הגדלות זכוכית', sortOrder: 30 },
    { name: 'הגדלות אקריליק', sortOrder: 40 },
    { name: 'הגדלות אלומיניום', sortOrder: 50 },
    { name: 'מסגרות', sortOrder: 60 },
    { name: 'ספלים', sortOrder: 70 },
    { name: 'כריות', sortOrder: 80 },
    { name: 'חולצות', sortOrder: 90 },
    { name: 'חומרי אריזה', sortOrder: 100 },
  ]

  const createdCategories = await Promise.all(
    categories.map((cat) =>
      prisma.category.create({
        data: cat,
      })
    )
  )

  // Create products
  const products = [
    {
      name: 'בלוק עץ 20x20 ס"מ',
      barcode: '7290000000001',
      categoryId: createdCategories[0].id,
      priceAgorot: 4900,
      status: ProductStatus.ACTIVE,
    },
    {
      name: 'בלוק עץ 30x30 ס"מ',
      barcode: '7290000000002',
      categoryId: createdCategories[0].id,
      priceAgorot: 9900,
      status: ProductStatus.ACTIVE,
    },
    {
      name: 'קנבס טבעי 40x50',
      barcode: '7290000000003',
      categoryId: createdCategories[1].id,
      priceAgorot: 12900,
      status: ProductStatus.ACTIVE,
    },
    {
      name: 'קנבס טבעי 50x70',
      barcode: '7290000000004',
      categoryId: createdCategories[1].id,
      priceAgorot: 19900,
      status: ProductStatus.OUT_OF_STOCK,
    },
    {
      name: 'הגדלה זכוכית 15x20',
      barcode: '7290000000005',
      categoryId: createdCategories[2].id,
      priceAgorot: 29900,
      status: ProductStatus.ACTIVE,
    },
    {
      name: 'הגדלה זכוכית 20x30',
      barcode: '7290000000006',
      categoryId: createdCategories[2].id,
      priceAgorot: 39900,
      status: ProductStatus.ACTIVE,
    },
    {
      name: 'הגדלה אקריליק 15x20',
      barcode: '7290000000007',
      categoryId: createdCategories[3].id,
      priceAgorot: 19900,
      status: ProductStatus.ACTIVE,
    },
    {
      name: 'הגדלה אקריליק 20x30',
      barcode: '7290000000008',
      categoryId: createdCategories[3].id,
      priceAgorot: 29900,
      status: ProductStatus.ACTIVE,
    },
    {
      name: 'הגדלה אלומיניום 15x20',
      barcode: '7290000000009',
      categoryId: createdCategories[4].id,
      priceAgorot: 34900,
      status: ProductStatus.ACTIVE,
    },
    {
      name: 'הגדלה אלומיניום 20x30',
      barcode: '7290000000010',
      categoryId: createdCategories[4].id,
      priceAgorot: 49900,
      status: ProductStatus.ACTIVE,
    },
    {
      name: 'מסגרת עץ טבעי 20x30',
      barcode: '7290000000011',
      categoryId: createdCategories[5].id,
      priceAgorot: 44900,
      status: ProductStatus.ACTIVE,
    },
    {
      name: 'מסגרת עץ טבעי 30x40',
      barcode: '7290000000012',
      categoryId: createdCategories[5].id,
      priceAgorot: 64900,
      status: ProductStatus.ACTIVE,
    },
    {
      name: 'ספל קרמי לבן 350 מ"ל',
      barcode: '7290000000013',
      categoryId: createdCategories[6].id,
      priceAgorot: 1900,
      status: ProductStatus.ACTIVE,
    },
    {
      name: 'ספל קרמי בעיצוב מיוחד',
      barcode: '7290000000014',
      categoryId: createdCategories[6].id,
      priceAgorot: 2900,
      status: ProductStatus.ACTIVE,
    },
    {
      name: 'כרית ריקמה 40x40',
      barcode: '7290000000015',
      categoryId: createdCategories[7].id,
      priceAgorot: 8900,
      status: ProductStatus.ACTIVE,
    },
    {
      name: 'כרית ריקמה 50x50',
      barcode: '7290000000016',
      categoryId: createdCategories[7].id,
      priceAgorot: 12900,
      status: ProductStatus.ACTIVE,
    },
    {
      name: 'חולצת טריקו גברים מ',
      barcode: '7290000000017',
      categoryId: createdCategories[8].id,
      priceAgorot: 4900,
      status: ProductStatus.ACTIVE,
    },
    {
      name: 'חולצת טריקו נשים מ',
      barcode: '7290000000018',
      categoryId: createdCategories[8].id,
      priceAgorot: 4900,
      status: ProductStatus.ACTIVE,
    },
    {
      name: 'נייר אריזה חום 80 גר״מ',
      barcode: '7290000000019',
      categoryId: createdCategories[9].id,
      priceAgorot: 1900,
      status: ProductStatus.ACTIVE,
    },
    {
      name: 'קופסה קרטון לבנה 20x15x10',
      barcode: '7290000000020',
      categoryId: createdCategories[9].id,
      priceAgorot: 990,
      status: ProductStatus.HIDDEN,
    },
  ]

  const createdProducts = await Promise.all(
    products.map((prod) =>
      prisma.product.create({
        data: prod,
      })
    )
  )

  // Create a historical SHIPPED order for testing
  const historicalOrder = await prisma.order.create({
    data: {
      number: 1001,
      storeId: store1.id,
      createdBy: franchisee1.id,
      status: 'SHIPPED',
      submittedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
      items: {
        create: [
          {
            productId: createdProducts[0].id,
            qtyOrdered: 5,
            qtySupplied: 5,
            priceAgorot: 4900,
            productName: createdProducts[0].name,
            productBarcode: createdProducts[0].barcode,
          },
          {
            productId: createdProducts[2].id,
            qtyOrdered: 3,
            qtySupplied: 3,
            priceAgorot: 12900,
            productName: createdProducts[2].name,
            productBarcode: createdProducts[2].barcode,
          },
        ],
      },
      history: {
        create: [
          {
            from: 'DRAFT',
            to: 'SUBMITTED',
            byUserId: franchisee1.id,
          },
          {
            from: 'SUBMITTED',
            to: 'RECEIVED',
            byUserId: warehouse.id,
          },
          {
            from: 'RECEIVED',
            to: 'PICKING',
            byUserId: warehouse.id,
          },
          {
            from: 'PICKING',
            to: 'READY',
            byUserId: warehouse.id,
          },
          {
            from: 'READY',
            to: 'SHIPPED',
            byUserId: warehouse.id,
          },
        ],
      },
    },
  })

  console.log('✅ Database seeded successfully!')
  console.log(`Stores: ${store1.name}, ${store2.name}`)
  console.log(`Users: ${franchisee1.name}, ${franchisee2.name}, ${warehouse.name}, ${admin.name}`)
  console.log(`Products: ${createdProducts.length}`)
  console.log(`Historical order: #${historicalOrder.number}`)
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
