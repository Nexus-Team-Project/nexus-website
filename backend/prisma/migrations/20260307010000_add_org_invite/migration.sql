-- CreateTable: OrgInvite
CREATE TABLE "OrgInvite" (
    "id"        TEXT NOT NULL,
    "orgId"     TEXT NOT NULL,
    "role"      "OrgRole" NOT NULL DEFAULT 'MEMBER',
    "token"     TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "label"     TEXT,
    "maxUses"   INTEGER,
    "useCount"  INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrgInvite_token_key" ON "OrgInvite"("token");
CREATE INDEX "OrgInvite_token_idx" ON "OrgInvite"("token");
CREATE INDEX "OrgInvite_orgId_idx" ON "OrgInvite"("orgId");

-- AddForeignKey
ALTER TABLE "OrgInvite"
    ADD CONSTRAINT "OrgInvite_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
