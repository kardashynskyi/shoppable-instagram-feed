import db from "../db.server";

export async function getInstagramPosts(shop: string) {
  return db.instagramPost.findMany({
    where: { shop },
    include: {
      tags: true,
      account: true,
    },
    orderBy: {
      timestamp: "desc",
    },
  });
}

export async function getInstagramPost(id: string, shop: string) {
  return db.instagramPost.findFirst({
    where: {
      id,
      shop,
    },
    include: {
      tags: true,
      account: true,
    },
  });
}

export async function createInstagramPost({
  shop,
  instagramId,
  accountId,
  mediaUrl,
  permalink,
  caption,
  mediaType = "IMAGE",
  thumbnailUrl,
  timestamp,
}: {
  shop: string;
  instagramId?: string;
  accountId?: string;
  mediaUrl: string;
  permalink?: string;
  caption?: string;
  mediaType?: string;
  thumbnailUrl?: string;
  timestamp?: Date;
}) {
  return db.instagramPost.create({
    data: {
      shop,
      instagramId,
      accountId,
      mediaUrl,
      permalink,
      caption,
      mediaType,
      thumbnailUrl,
      timestamp,
    },
  });
}

export async function updateInstagramPost(
  id: string,
  shop: string,
  data: {
    mediaUrl?: string;
    permalink?: string;
    caption?: string;
    mediaType?: string;
    thumbnailUrl?: string;
    timestamp?: Date;
    isPublished?: boolean;
  },
) {
  return db.instagramPost.updateMany({
    where: {
      id,
      shop,
    },
    data,
  });
}

export async function deleteInstagramPost(id: string, shop: string) {
  return db.instagramPost.deleteMany({
    where: {
      id,
      shop,
    },
  });
}

export async function tagInstagramPost({
  shop,
  postId,
  productId,
  productHandle,
  productTitle,
  collectionId,
  collectionHandle,
  collectionTitle,
  xPosition,
  yPosition,
}: {
  shop: string;
  postId: string;
  productId?: string;
  productHandle?: string;
  productTitle?: string;
  collectionId?: string;
  collectionHandle?: string;
  collectionTitle?: string;
  xPosition?: number;
  yPosition?: number;
}) {
  return db.instagramPostTag.create({
    data: {
      shop,
      postId,
      productId,
      productHandle,
      productTitle,
      collectionId,
      collectionHandle,
      collectionTitle,
      xPosition,
      yPosition,
    },
  });
}

export async function deleteInstagramPostTag(id: string, shop: string) {
  return db.instagramPostTag.deleteMany({
    where: {
      id,
      shop,
    },
  });
}

export async function getInstagramAccount(shop: string) {
  return db.instagramAccount.findFirst({
    where: { shop },
  });
}

export async function upsertInstagramAccount({
  shop,
  instagramId,
  username,
  accessToken,
  connected = true,
}: {
  shop: string;
  instagramId?: string;
  username?: string;
  accessToken?: string;
  connected?: boolean;
}) {
  const existingAccount = await db.instagramAccount.findFirst({
    where: { shop },
  });

  if (existingAccount) {
    return db.instagramAccount.update({
      where: { id: existingAccount.id },
      data: {
        instagramId,
        username,
        accessToken,
        connected,
      },
    });
  }

  return db.instagramAccount.create({
    data: {
      shop,
      instagramId,
      username,
      accessToken,
      connected,
    },
  });
}