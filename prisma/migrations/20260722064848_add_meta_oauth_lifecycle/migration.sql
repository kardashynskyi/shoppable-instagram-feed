-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_InstagramAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "pageId" TEXT,
    "instagramId" TEXT,
    "facebookUserId" TEXT,
    "username" TEXT,
    "accessToken" TEXT,
    "tokenType" TEXT,
    "tokenIssuedAt" DATETIME,
    "tokenExpiresAt" DATETIME,
    "grantedScopes" TEXT,
    "connected" BOOLEAN NOT NULL DEFAULT false,
    "reconnectRequired" BOOLEAN NOT NULL DEFAULT false,
    "connectedAt" DATETIME,
    "disconnectedAt" DATETIME,
    "lastTokenCheckedAt" DATETIME,
    "lastSyncedAt" DATETIME,
    "lastSyncError" TEXT,
    "lastSyncErrorCode" TEXT,
    "syncInProgress" BOOLEAN NOT NULL DEFAULT false,
    "syncStartedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_InstagramAccount" ("accessToken", "connected", "createdAt", "id", "instagramId", "lastSyncError", "lastSyncedAt", "pageId", "shop", "tokenExpiresAt", "updatedAt", "username") SELECT "accessToken", "connected", "createdAt", "id", "instagramId", "lastSyncError", "lastSyncedAt", "pageId", "shop", "tokenExpiresAt", "updatedAt", "username" FROM "InstagramAccount";
DROP TABLE "InstagramAccount";
ALTER TABLE "new_InstagramAccount" RENAME TO "InstagramAccount";
CREATE UNIQUE INDEX "InstagramAccount_shop_key" ON "InstagramAccount"("shop");
CREATE INDEX "InstagramAccount_pageId_idx" ON "InstagramAccount"("pageId");
CREATE INDEX "InstagramAccount_instagramId_idx" ON "InstagramAccount"("instagramId");
CREATE INDEX "InstagramAccount_connected_idx" ON "InstagramAccount"("connected");
CREATE INDEX "InstagramAccount_reconnectRequired_idx" ON "InstagramAccount"("reconnectRequired");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "InstagramPost_shop_isPublished_idx" ON "InstagramPost"("shop", "isPublished");

-- CreateIndex
CREATE INDEX "InstagramPost_shop_timestamp_idx" ON "InstagramPost"("shop", "timestamp");

-- CreateIndex
CREATE INDEX "InstagramPostTag_variantId_idx" ON "InstagramPostTag"("variantId");

-- CreateIndex
CREATE INDEX "Session_shop_idx" ON "Session"("shop");
