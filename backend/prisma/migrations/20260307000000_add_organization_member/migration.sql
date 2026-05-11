-- CreateEnum
CREATE TYPE "OrgRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateTable: Organization
CREATE TABLE "Organization" (
    "id"           TEXT NOT NULL,
    "slug"         TEXT NOT NULL,
    "name"         TEXT NOT NULL,
    "nameHe"       TEXT,
    "logoUrl"      TEXT,
    "primaryColor" TEXT,
    "plan"         TEXT,
    "isPremium"    BOOLEAN NOT NULL DEFAULT false,
    "isPublished"  BOOLEAN NOT NULL DEFAULT false,
    "websiteUrl"   TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable: OrganizationMember
CREATE TABLE "OrganizationMember" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "orgId"       TEXT NOT NULL,
    "role"        "OrgRole" NOT NULL DEFAULT 'MEMBER',
    "displayName" TEXT,
    "avatarUrl"   TEXT,
    "title"       TEXT,
    "joinedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");
CREATE INDEX "Organization_slug_idx" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMember_userId_orgId_key" ON "OrganizationMember"("userId", "orgId");
CREATE INDEX "OrganizationMember_userId_idx" ON "OrganizationMember"("userId");
CREATE INDEX "OrganizationMember_orgId_idx" ON "OrganizationMember"("orgId");

-- AddForeignKey
ALTER TABLE "OrganizationMember"
    ADD CONSTRAINT "OrganizationMember_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrganizationMember"
    ADD CONSTRAINT "OrganizationMember_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
