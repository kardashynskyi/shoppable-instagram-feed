-- CreateTable
CREATE TABLE "InstagramAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "instagramId" TEXT,
    "username" TEXT,
    "accessToken" TEXT,
    "connected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "InstagramPost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "instagramId" TEXT,
    "accountId" TEXT,
    "mediaUrl" TEXT NOT NULL,
    "permalink" TEXT,
    "caption" TEXT,
    "mediaType" TEXT NOT NULL DEFAULT 'IMAGE',
    "thumbnailUrl" TEXT,
    "timestamp" DATETIME,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InstagramPost_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InstagramAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InstagramPostTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "productId" TEXT,
    "productHandle" TEXT,
    "productTitle" TEXT,
    "collectionId" TEXT,
    "collectionHandle" TEXT,
    "collectionTitle" TEXT,
    "xPosition" REAL,
    "yPosition" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InstagramPostTag_postId_fkey" FOREIGN KEY ("postId") REFERENCES "InstagramPost" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "InstagramAccount_shop_idx" ON "InstagramAccount"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "InstagramPost_instagramId_key" ON "InstagramPost"("instagramId");

-- CreateIndex
CREATE INDEX "InstagramPost_shop_idx" ON "InstagramPost"("shop");

-- CreateIndex
CREATE INDEX "InstagramPost_accountId_idx" ON "InstagramPost"("accountId");

-- CreateIndex
CREATE INDEX "InstagramPostTag_shop_idx" ON "InstagramPostTag"("shop");

-- CreateIndex
CREATE INDEX "InstagramPostTag_postId_idx" ON "InstagramPostTag"("postId");

-- CreateIndex
CREATE INDEX "InstagramPostTag_productId_idx" ON "InstagramPostTag"("productId");

-- CreateIndex
CREATE INDEX "InstagramPostTag_collectionId_idx" ON "InstagramPostTag"("collectionId");
