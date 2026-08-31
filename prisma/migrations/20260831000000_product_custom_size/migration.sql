-- One-off franchisee-created products (custom canvas sizes): orderable but
-- hidden from the catalog and search.
ALTER TABLE "Product" ADD COLUMN "customSize" BOOLEAN NOT NULL DEFAULT false;
