-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstagramAccount" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "pageId" TEXT,
    "instagramId" TEXT,
    "facebookUserId" TEXT,
    "username" TEXT,
    "accessToken" TEXT,
    "tokenType" TEXT,
    "tokenIssuedAt" TIMESTAMP(3),
    "tokenExpiresAt" TIMESTAMP(3),
    "grantedScopes" TEXT,
    "connected" BOOLEAN NOT NULL DEFAULT false,
    "reconnectRequired" BOOLEAN NOT NULL DEFAULT false,
    "connectedAt" TIMESTAMP(3),
    "disconnectedAt" TIMESTAMP(3),
    "lastTokenCheckedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "lastSyncErrorCode" TEXT,
    "syncInProgress" BOOLEAN NOT NULL DEFAULT false,
    "syncStartedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstagramPost" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "instagramId" TEXT,
    "accountId" TEXT,
    "mediaUrl" TEXT NOT NULL,
    "permalink" TEXT,
    "caption" TEXT,
    "mediaType" TEXT NOT NULL DEFAULT 'IMAGE',
    "thumbnailUrl" TEXT,
    "timestamp" TIMESTAMP(3),
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstagramPostTag" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "productId" TEXT,
    "variantId" TEXT,
    "productHandle" TEXT,
    "productTitle" TEXT,
    "collectionId" TEXT,
    "collectionHandle" TEXT,
    "collectionTitle" TEXT,
    "xPosition" DOUBLE PRECISION,
    "yPosition" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramPostTag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Session_shop_idx" ON "Session"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "InstagramAccount_shop_key" ON "InstagramAccount"("shop");

-- CreateIndex
CREATE INDEX "InstagramAccount_pageId_idx" ON "InstagramAccount"("pageId");

-- CreateIndex
CREATE INDEX "InstagramAccount_instagramId_idx" ON "InstagramAccount"("instagramId");

-- CreateIndex
CREATE INDEX "InstagramAccount_connected_idx" ON "InstagramAccount"("connected");

-- CreateIndex
CREATE INDEX "InstagramAccount_reconnectRequired_idx" ON "InstagramAccount"("reconnectRequired");

-- CreateIndex
CREATE UNIQUE INDEX "InstagramPost_instagramId_key" ON "InstagramPost"("instagramId");

-- CreateIndex
CREATE INDEX "InstagramPost_shop_idx" ON "InstagramPost"("shop");

-- CreateIndex
CREATE INDEX "InstagramPost_accountId_idx" ON "InstagramPost"("accountId");

-- CreateIndex
CREATE INDEX "InstagramPost_shop_isPublished_idx" ON "InstagramPost"("shop", "isPublished");

-- CreateIndex
CREATE INDEX "InstagramPost_shop_timestamp_idx" ON "InstagramPost"("shop", "timestamp");

-- CreateIndex
CREATE INDEX "InstagramPostTag_shop_idx" ON "InstagramPostTag"("shop");

-- CreateIndex
CREATE INDEX "InstagramPostTag_postId_idx" ON "InstagramPostTag"("postId");

-- CreateIndex
CREATE INDEX "InstagramPostTag_productId_idx" ON "InstagramPostTag"("productId");

-- CreateIndex
CREATE INDEX "InstagramPostTag_variantId_idx" ON "InstagramPostTag"("variantId");

-- CreateIndex
CREATE INDEX "InstagramPostTag_collectionId_idx" ON "InstagramPostTag"("collectionId");

-- AddForeignKey
ALTER TABLE "InstagramPost" ADD CONSTRAINT "InstagramPost_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InstagramAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramPostTag" ADD CONSTRAINT "InstagramPostTag_postId_fkey" FOREIGN KEY ("postId") REFERENCES "InstagramPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
