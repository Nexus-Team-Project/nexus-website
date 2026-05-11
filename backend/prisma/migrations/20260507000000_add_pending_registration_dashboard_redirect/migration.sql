-- Stores a safe local dashboard continuation for email verification.
-- This lets invite signups finish from another browser without losing the invite accept path.
ALTER TABLE "PendingRegistration" ADD COLUMN "dashboardRedirect" TEXT;
