-- How many individual sellable units one ordered/picked unit contains.
-- Picking stays in packs; invoice/ERP quantities are multiplied by this.
ALTER TABLE "Product" ADD COLUMN "unitsPerPack" INTEGER NOT NULL DEFAULT 1;
