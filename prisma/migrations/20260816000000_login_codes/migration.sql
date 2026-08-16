-- Additive: per-branch login password (Store.loginCode) and personal login
-- password for warehouse/admin users (User.loginCode).
ALTER TABLE "Store" ADD COLUMN "loginCode" TEXT;
ALTER TABLE "User" ADD COLUMN "loginCode" TEXT;

CREATE UNIQUE INDEX "Store_loginCode_key" ON "Store"("loginCode");
CREATE UNIQUE INDEX "User_loginCode_key" ON "User"("loginCode");
