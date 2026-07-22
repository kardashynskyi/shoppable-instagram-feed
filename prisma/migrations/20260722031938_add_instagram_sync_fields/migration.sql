/*
  Warnings:

  - A unique constraint covering the columns `[shop]` on the table `InstagramAccount` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "InstagramAccount_shop_idx";

-- AlterTable
ALTER TABLE "InstagramAccount" ADD COLUMN "lastSyncError" TEXT;
ALTER TABLE "InstagramAccount" ADD COLUMN "lastSyncedAt" DATETIME;
ALTER TABLE "InstagramAccount" ADD COLUMN "pageId" TEXT;
ALTER TABLE "InstagramAccount" ADD COLUMN "tokenExpiresAt" DATETIME;

-- CreateIndex
CREATE UNIQUE INDEX "InstagramAccount_shop_key" ON "InstagramAccount"("shop");
