-- Warehouse-only visual marker on orders:
-- YELLOW = waiting for products in production, GREEN = picked and invoiced.
CREATE TYPE "WarehouseMark" AS ENUM ('YELLOW', 'GREEN');
ALTER TABLE "Order" ADD COLUMN "warehouseMark" "WarehouseMark";
