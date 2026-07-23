-- Add login-gated cashback percentage to partners (shown on /partners cards for signed-in users).
ALTER TABLE "Partner" ADD COLUMN "cashbackPct" DOUBLE PRECISION;
