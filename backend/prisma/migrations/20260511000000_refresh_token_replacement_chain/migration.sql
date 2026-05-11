-- Adds the replacement chain column to RefreshToken so rotating tokens can
-- link old → new. This lets a racing second refresh call follow the chain
-- and get fresh tokens instead of triggering the bulk-revoke cascade.
ALTER TABLE "RefreshToken" ADD COLUMN "replacedByTokenHash" TEXT;

CREATE INDEX "RefreshToken_replacedByTokenHash_idx" ON "RefreshToken"("replacedByTokenHash");
