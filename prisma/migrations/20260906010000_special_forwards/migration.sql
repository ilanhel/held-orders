-- CreateTable
CREATE TABLE "SpecialForward" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpecialForward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpecialForwardProduct" (
    "id" TEXT NOT NULL,
    "forwardId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,

    CONSTRAINT "SpecialForwardProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpecialForwardCategory" (
    "id" TEXT NOT NULL,
    "forwardId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "SpecialForwardCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SpecialForwardProduct_forwardId_productId_key" ON "SpecialForwardProduct"("forwardId", "productId");

-- CreateIndex
CREATE INDEX "SpecialForwardProduct_productId_idx" ON "SpecialForwardProduct"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "SpecialForwardCategory_forwardId_categoryId_key" ON "SpecialForwardCategory"("forwardId", "categoryId");

-- CreateIndex
CREATE INDEX "SpecialForwardCategory_categoryId_idx" ON "SpecialForwardCategory"("categoryId");

-- AddForeignKey
ALTER TABLE "SpecialForwardProduct" ADD CONSTRAINT "SpecialForwardProduct_forwardId_fkey" FOREIGN KEY ("forwardId") REFERENCES "SpecialForward"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecialForwardProduct" ADD CONSTRAINT "SpecialForwardProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecialForwardCategory" ADD CONSTRAINT "SpecialForwardCategory_forwardId_fkey" FOREIGN KEY ("forwardId") REFERENCES "SpecialForward"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecialForwardCategory" ADD CONSTRAINT "SpecialForwardCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: migrate the single-number setting (specialFramesPhone) into a
-- forwarding destination with the previously hardcoded product set:
-- category "בלינדרמים" + products named מסגרת מוארת / ארגז שקיות / שקיות ניילון.
INSERT INTO "SpecialForward" ("id", "name", "phone", "active", "updatedAt")
SELECT 'fwd' || md5(random()::text), 'מסגרות ושקיות', "value", true, NOW()
FROM "AppSetting" WHERE "key" = 'specialFramesPhone' AND "value" <> '';

INSERT INTO "SpecialForwardCategory" ("id", "forwardId", "categoryId")
SELECT 'fwc' || md5(random()::text || c."id"), f."id", c."id"
FROM "SpecialForward" f
CROSS JOIN "Category" c
WHERE c."name" = 'בלינדרמים';

INSERT INTO "SpecialForwardProduct" ("id", "forwardId", "productId")
SELECT 'fwp' || md5(random()::text || p."id"), f."id", p."id"
FROM "SpecialForward" f
CROSS JOIN "Product" p
WHERE p."name" LIKE '%מסגרת מוארת%'
   OR p."name" LIKE '%ארגז שקיות%'
   OR p."name" LIKE '%שקיות ניילון%';
