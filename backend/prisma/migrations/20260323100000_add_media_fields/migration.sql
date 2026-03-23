-- AlterTable: Add media fields to ChatMessage
ALTER TABLE "ChatMessage" ADD COLUMN "mediaUrl" TEXT;
ALTER TABLE "ChatMessage" ADD COLUMN "mediaType" TEXT;
ALTER TABLE "ChatMessage" ADD COLUMN "fileName" TEXT;
