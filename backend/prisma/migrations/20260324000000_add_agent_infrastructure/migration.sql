-- CreateEnum
CREATE TYPE "AgentType" AS ENUM ('SEO', 'MARKETING', 'SALES');

-- CreateEnum
CREATE TYPE "AutomationStatus" AS ENUM ('ACTIVE', 'PAUSED', 'DISABLED');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'TIMEOUT', 'SKIPPED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'DONE', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "ApprovalMode" AS ENUM ('AUTO', 'NOTIFY_24H', 'REQUIRE_APPROVAL', 'BLOCKED');

-- AlterTable
ALTER TABLE "ChatSession" ADD COLUMN     "agentId" TEXT;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "agentId" TEXT,
ADD COLUMN     "followUpCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastFollowUpAt" TIMESTAMP(3),
ADD COLUMN     "nextFollowUpAt" TIMESTAMP(3),
ADD COLUMN     "qualificationReason" TEXT,
ADD COLUMN     "qualificationScore" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "AgentRequest" ADD COLUMN     "agentId" TEXT,
ADD COLUMN     "approvalMode" "ApprovalMode",
ADD COLUMN     "confidence" DOUBLE PRECISION,
ADD COLUMN     "newValue" TEXT,
ADD COLUMN     "oldValue" TEXT,
ADD COLUMN     "pageUrl" TEXT,
ADD COLUMN     "seoField" TEXT;

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AgentType" NOT NULL,
    "description" TEXT,
    "systemPrompt" TEXT,
    "config" JSONB,
    "integrations" TEXT[],
    "skills" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentAutomation" (
    "id" TEXT NOT NULL,
    "agentId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "skill" TEXT NOT NULL,
    "cronExpr" TEXT NOT NULL,
    "status" "AutomationStatus" NOT NULL DEFAULT 'ACTIVE',
    "priority" INTEGER NOT NULL DEFAULT 5,
    "timeoutSec" INTEGER NOT NULL DEFAULT 1800,
    "config" JSONB,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentAutomation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentAutomationRun" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "tokensUsed" INTEGER,
    "costUsd" DOUBLE PRECISION,
    "summary" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentAutomationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentLog" (
    "id" TEXT NOT NULL,
    "agentId" TEXT,
    "skill" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "tokensUsed" INTEGER,
    "costUsd" DOUBLE PRECISION,
    "durationMs" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'success',
    "errorMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentTask" (
    "id" TEXT NOT NULL,
    "agentId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "skill" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "impact" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "ease" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "iceScore" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "payload" JSONB,
    "result" JSONB,
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenBudget" (
    "id" TEXT NOT NULL,
    "agentId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "budgetUsd" DOUBLE PRECISION NOT NULL DEFAULT 0.30,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TokenBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeoPrompt" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "lang" TEXT NOT NULL DEFAULT 'he',
    "category" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeoPrompt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeoSnapshot" (
    "id" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "mentioned" BOOLEAN NOT NULL DEFAULT false,
    "mentionCount" INTEGER NOT NULL DEFAULT 0,
    "positionRatio" DOUBLE PRECISION,
    "snippet" TEXT,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeoSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentMemory" (
    "id" TEXT NOT NULL,
    "agentId" TEXT,
    "memoryType" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" DOUBLE PRECISION[],
    "metadata" JSONB,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentMemory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Agent_slug_key" ON "Agent"("slug");

-- CreateIndex
CREATE INDEX "Agent_slug_idx" ON "Agent"("slug");

-- CreateIndex
CREATE INDEX "Agent_type_idx" ON "Agent"("type");

-- CreateIndex
CREATE INDEX "Agent_isActive_idx" ON "Agent"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AgentAutomation_name_key" ON "AgentAutomation"("name");

-- CreateIndex
CREATE INDEX "AgentAutomation_agentId_idx" ON "AgentAutomation"("agentId");

-- CreateIndex
CREATE INDEX "AgentAutomation_status_idx" ON "AgentAutomation"("status");

-- CreateIndex
CREATE INDEX "AgentAutomation_skill_idx" ON "AgentAutomation"("skill");

-- CreateIndex
CREATE INDEX "AgentAutomationRun_automationId_idx" ON "AgentAutomationRun"("automationId");

-- CreateIndex
CREATE INDEX "AgentAutomationRun_status_idx" ON "AgentAutomationRun"("status");

-- CreateIndex
CREATE INDEX "AgentAutomationRun_createdAt_idx" ON "AgentAutomationRun"("createdAt");

-- CreateIndex
CREATE INDEX "AgentLog_agentId_idx" ON "AgentLog"("agentId");

-- CreateIndex
CREATE INDEX "AgentLog_skill_idx" ON "AgentLog"("skill");

-- CreateIndex
CREATE INDEX "AgentLog_status_idx" ON "AgentLog"("status");

-- CreateIndex
CREATE INDEX "AgentLog_createdAt_idx" ON "AgentLog"("createdAt");

-- CreateIndex
CREATE INDEX "AgentTask_agentId_idx" ON "AgentTask"("agentId");

-- CreateIndex
CREATE INDEX "AgentTask_status_idx" ON "AgentTask"("status");

-- CreateIndex
CREATE INDEX "AgentTask_iceScore_idx" ON "AgentTask"("iceScore");

-- CreateIndex
CREATE INDEX "AgentTask_createdAt_idx" ON "AgentTask"("createdAt");

-- CreateIndex
CREATE INDEX "TokenBudget_agentId_idx" ON "TokenBudget"("agentId");

-- CreateIndex
CREATE INDEX "TokenBudget_date_idx" ON "TokenBudget"("date");

-- CreateIndex
CREATE UNIQUE INDEX "TokenBudget_date_agentId_key" ON "TokenBudget"("date", "agentId");

-- CreateIndex
CREATE INDEX "GeoPrompt_active_idx" ON "GeoPrompt"("active");

-- CreateIndex
CREATE INDEX "GeoPrompt_lang_idx" ON "GeoPrompt"("lang");

-- CreateIndex
CREATE INDEX "GeoSnapshot_promptId_idx" ON "GeoSnapshot"("promptId");

-- CreateIndex
CREATE INDEX "GeoSnapshot_model_idx" ON "GeoSnapshot"("model");

-- CreateIndex
CREATE INDEX "GeoSnapshot_runAt_idx" ON "GeoSnapshot"("runAt");

-- CreateIndex
CREATE INDEX "AgentMemory_agentId_idx" ON "AgentMemory"("agentId");

-- CreateIndex
CREATE INDEX "AgentMemory_memoryType_idx" ON "AgentMemory"("memoryType");

-- CreateIndex
CREATE INDEX "AgentMemory_key_idx" ON "AgentMemory"("key");

-- CreateIndex
CREATE INDEX "ChatSession_agentId_idx" ON "ChatSession"("agentId");

-- CreateIndex
CREATE INDEX "Lead_agentId_idx" ON "Lead"("agentId");

-- CreateIndex
CREATE INDEX "AgentRequest_agentId_idx" ON "AgentRequest"("agentId");

-- AddForeignKey
ALTER TABLE "AgentAutomation" ADD CONSTRAINT "AgentAutomation_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentAutomationRun" ADD CONSTRAINT "AgentAutomationRun_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "AgentAutomation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentLog" ADD CONSTRAINT "AgentLog_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenBudget" ADD CONSTRAINT "TokenBudget_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeoSnapshot" ADD CONSTRAINT "GeoSnapshot_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "GeoPrompt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
