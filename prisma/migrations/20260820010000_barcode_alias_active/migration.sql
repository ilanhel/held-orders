-- Allow hiding a specific alias barcode (out of stock at supplier)
ALTER TABLE "ProductBarcodeAlias" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
