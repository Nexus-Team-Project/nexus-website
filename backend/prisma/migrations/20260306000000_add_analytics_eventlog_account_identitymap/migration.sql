-- CreateEnum
CREATE TYPE "EventChannel" AS ENUM ('MARKETING', 'PRODUCT', 'WALLET');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('B2B', 'B2C');

-- CreateTable: Account
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL DEFAULT 'B2C',
    "domain" TEXT,
    "plan" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Account_domain_idx" ON "Account"("domain");

-- Add accountId to User
ALTER TABLE "User" ADD COLUMN "accountId" TEXT;

CREATE INDEX "User_accountId_idx" ON "User"("accountId");

ALTER TABLE "User" ADD CONSTRAINT "User_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "Account"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Fix VisitorProfile: add missing fields
ALTER TABLE "VisitorProfile"
    ADD COLUMN IF NOT EXISTS "pageViews" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "ip"      TEXT,
    ADD COLUMN IF NOT EXISTS "city"    TEXT,
    ADD COLUMN IF NOT EXISTS "country" TEXT,
    ADD COLUMN IF NOT EXISTS "device"  TEXT,
    ADD COLUMN IF NOT EXISTS "browser" TEXT;

-- CreateTable: EventLog (Source of Truth)
CREATE TABLE "EventLog" (
    "id"          TEXT NOT NULL,
    "anonymousId" TEXT,
    "userId"      TEXT,
    "accountId"   TEXT,
    "eventName"   TEXT NOT NULL,
    "channel"     "EventChannel" NOT NULL,
    "properties"  JSONB NOT NULL,
    "context"     JSONB NOT NULL,
    "sentAt"      TIMESTAMP(3),
    "receivedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EventLog_anonymousId_idx" ON "EventLog"("anonymousId");
CREATE INDEX "EventLog_userId_idx" ON "EventLog"("userId");
CREATE INDEX "EventLog_accountId_idx" ON "EventLog"("accountId");
CREATE INDEX "EventLog_eventName_receivedAt_idx" ON "EventLog"("eventName", "receivedAt");
CREATE INDEX "EventLog_channel_receivedAt_idx" ON "EventLog"("channel", "receivedAt");

-- CreateTable: IdentityMap
CREATE TABLE "IdentityMap" (
    "id"          TEXT NOT NULL,
    "anonymousId" TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "mergeSource" TEXT NOT NULL,
    "mergedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdentityMap_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IdentityMap_anonymousId_userId_key" ON "IdentityMap"("anonymousId", "userId");
CREATE INDEX "IdentityMap_anonymousId_idx" ON "IdentityMap"("anonymousId");
CREATE INDEX "IdentityMap_userId_idx" ON "IdentityMap"("userId");
