-- CreateEnum
CREATE TYPE "ArticleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AgentAction" AS ENUM ('BLOG_PUBLISH', 'BLOG_UPDATE_PUBLISHED', 'BLOG_UNPUBLISH');

-- CreateEnum
CREATE TYPE "AgentRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXECUTED');

-- CreateTable
CREATE TABLE "BlogArticle" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "status" "ArticleStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "excerpt" TEXT,
    "heroImage" TEXT,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "category" TEXT,
    "authorName" TEXT,
    "authorRole" TEXT,
    "authorAvatar" TEXT,
    "publishDate" TIMESTAMP(3),
    "readTime" INTEGER,
    "sectionsJson" JSONB NOT NULL,
    "faqJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "BlogArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRequest" (
    "id" TEXT NOT NULL,
    "action" "AgentAction" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "AgentRequestStatus" NOT NULL DEFAULT 'PENDING',
    "result" JSONB,
    "rejectionReason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,

    CONSTRAINT "AgentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BlogArticle_slug_lang_key" ON "BlogArticle"("slug", "lang");

-- CreateIndex
CREATE INDEX "BlogArticle_lang_status_idx" ON "BlogArticle"("lang", "status");

-- CreateIndex
CREATE INDEX "BlogArticle_status_idx" ON "BlogArticle"("status");

-- CreateIndex
CREATE INDEX "AgentRequest_status_idx" ON "AgentRequest"("status");

-- CreateIndex
CREATE INDEX "AgentRequest_requestedAt_idx" ON "AgentRequest"("requestedAt");
