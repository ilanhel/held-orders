-- CreateTable: persistent OTP codes (DB-backed so logins work on serverless)
CREATE TABLE "OtpCode" (
    "phone" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "requestTimes" TIMESTAMP(3)[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("phone")
);
