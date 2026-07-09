-- Add bilingual search aliases to partners (searchable in both HE and EN on /partners).
ALTER TABLE "Partner" ADD COLUMN "searchTerms" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
