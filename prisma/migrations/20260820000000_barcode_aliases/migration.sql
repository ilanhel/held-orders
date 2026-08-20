-- Multi-barcode products: alias table + sticky per-store barcode assignment

-- CreateTable
CREATE TABLE "ProductBarcodeAlias" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductBarcodeAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreProductBarcode" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreProductBarcode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductBarcodeAlias_barcode_key" ON "ProductBarcodeAlias"("barcode");

-- CreateIndex
CREATE INDEX "ProductBarcodeAlias_productId_idx" ON "ProductBarcodeAlias"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreProductBarcode_storeId_productId_key" ON "StoreProductBarcode"("storeId", "productId");

-- CreateIndex
CREATE INDEX "StoreProductBarcode_productId_idx" ON "StoreProductBarcode"("productId");

-- AddForeignKey
ALTER TABLE "ProductBarcodeAlias" ADD CONSTRAINT "ProductBarcodeAlias_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreProductBarcode" ADD CONSTRAINT "StoreProductBarcode_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreProductBarcode" ADD CONSTRAINT "StoreProductBarcode_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
