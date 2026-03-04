-- Drop old EmailVerification table (no longer needed — users are not created until email is confirmed)
DROP TABLE IF EXISTS "EmailVerification";

-- Delete any users that registered via EMAIL but never verified (they'll re-register cleanly)
DELETE FROM "RefreshToken" WHERE "userId" IN (
  SELECT "id" FROM "User" WHERE "emailVerified" = false AND "provider" = 'EMAIL'
);
DELETE FROM "User" WHERE "emailVerified" = false AND "provider" = 'EMAIL';

-- CreateTable
CREATE TABLE "PendingRegistration" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'IL',
    "emailUpdates" BOOLEAN NOT NULL DEFAULT true,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PendingRegistration_email_key" ON "PendingRegistration"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PendingRegistration_tokenHash_key" ON "PendingRegistration"("tokenHash");

-- CreateIndex
CREATE INDEX "PendingRegistration_tokenHash_idx" ON "PendingRegistration"("tokenHash");

-- CreateIndex
CREATE INDEX "PendingRegistration_email_idx" ON "PendingRegistration"("email");
