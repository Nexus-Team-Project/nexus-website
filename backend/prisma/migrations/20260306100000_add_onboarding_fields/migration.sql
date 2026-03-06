-- AlterTable: User — add phone, jobTitle, onboardingDone
ALTER TABLE "User"
  ADD COLUMN "phone"          TEXT,
  ADD COLUMN "jobTitle"       TEXT,
  ADD COLUMN "onboardingDone" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: Account — add websiteUrl, businessDesc, useCases
ALTER TABLE "Account"
  ADD COLUMN "websiteUrl"   TEXT,
  ADD COLUMN "businessDesc" TEXT,
  ADD COLUMN "useCases"     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
