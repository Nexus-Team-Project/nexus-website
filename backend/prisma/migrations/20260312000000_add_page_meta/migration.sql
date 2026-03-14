-- CreateTable: PageMeta — SEO overrides for any page, written by the agent (Tier 1)
CREATE TABLE "PageMeta" (
    "id"              TEXT NOT NULL,
    "slug"            TEXT NOT NULL,
    "lang"            TEXT NOT NULL DEFAULT 'en',
    "metaTitle"       TEXT,
    "metaDescription" TEXT,
    "ogImage"         TEXT,
    "updatedBy"       TEXT,
    "updatedAt"       TIMESTAMP(3) NOT NULL,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageMeta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PageMeta_slug_lang_key" ON "PageMeta"("slug", "lang");
CREATE INDEX "PageMeta_slug_idx"            ON "PageMeta"("slug");
CREATE INDEX "PageMeta_lang_idx"            ON "PageMeta"("lang");
