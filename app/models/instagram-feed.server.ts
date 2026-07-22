import db from "../db.server";

const META_GRAPH_API_VERSION = "v25.0";
const META_GRAPH_API_BASE = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;

const DEFAULT_META_PAGE_ID = "361723987027926";
const DEFAULT_INSTAGRAM_ACCOUNT_ID = "17841467463541906";

type MetaInstagramMedia = {
  id: string;
  caption?: string;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
};

type MetaMediaResponse = {
  data?: MetaInstagramMedia[];
  paging?: {
    next?: string;
  };
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
  };
};

type MetaInstagramProfileResponse = {
  id?: string;
  username?: string;
  error?: {
    message?: string;
    code?: number;
  };
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown Instagram sync error.";
}

async function fetchMetaJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  const result = (await response.json()) as T & {
    error?: {
      message?: string;
      code?: number;
    };
  };

  if (!response.ok || result.error) {
    throw new Error(
      result.error?.message ||
        `Meta API request failed with HTTP ${response.status}.`,
    );
  }

  return result;
}

export async function getInstagramPosts(shop: string) {
  return db.instagramPost.findMany({
    where: {
      shop,
    },
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
  variantId,
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
  variantId?: string;
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
      variantId,
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
  return db.instagramAccount.findUnique({
    where: {
      shop,
    },
  });
}

export async function upsertInstagramAccount({
  shop,
  pageId,
  instagramId,
  username,
  accessToken,
  tokenExpiresAt,
  connected = true,
}: {
  shop: string;
  pageId?: string;
  instagramId?: string;
  username?: string;
  accessToken?: string;
  tokenExpiresAt?: Date;
  connected?: boolean;
}) {
  return db.instagramAccount.upsert({
    where: {
      shop,
    },
    create: {
      shop,
      pageId,
      instagramId,
      username,
      accessToken,
      tokenExpiresAt,
      connected,
    },
    update: {
      pageId,
      instagramId,
      username,
      accessToken,
      tokenExpiresAt,
      connected,
      lastSyncError: null,
    },
  });
}

export async function disconnectInstagramAccount(shop: string) {
  const account = await getInstagramAccount(shop);

  if (!account) {
    return null;
  }

  return db.instagramAccount.update({
    where: {
      id: account.id,
    },
    data: {
      connected: false,
      accessToken: null,
      tokenExpiresAt: null,
    },
  });
}

export async function syncInstagramPosts(shop: string) {
  const accessToken = process.env.META_ACCESS_TOKEN;

  const pageId =
    process.env.META_PAGE_ID || DEFAULT_META_PAGE_ID;

  const instagramId =
    process.env.META_INSTAGRAM_ACCOUNT_ID ||
    DEFAULT_INSTAGRAM_ACCOUNT_ID;

  if (!accessToken) {
    throw new Error(
      "META_ACCESS_TOKEN is missing from the server environment.",
    );
  }

  const account = await upsertInstagramAccount({
    shop,
    pageId,
    instagramId,
    accessToken,
    connected: true,
  });

  try {
    const profileParams = new URLSearchParams({
      fields: "id,username",
      access_token: accessToken,
    });

    const profileUrl =
      `${META_GRAPH_API_BASE}/${instagramId}` +
      `?${profileParams.toString()}`;

    const profile =
      await fetchMetaJson<MetaInstagramProfileResponse>(profileUrl);

    const mediaParams = new URLSearchParams({
      fields:
        "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp",
      limit: "100",
      access_token: accessToken,
    });

    let nextUrl: string | undefined =
      `${META_GRAPH_API_BASE}/${instagramId}/media` +
      `?${mediaParams.toString()}`;

    let syncedCount = 0;
    let skippedCount = 0;
    let pageCount = 0;

    const maximumPages = 20;

    while (nextUrl && pageCount < maximumPages) {
      pageCount += 1;

      const response =
        await fetchMetaJson<MetaMediaResponse>(nextUrl);

      const mediaItems = response.data ?? [];

      for (const media of mediaItems) {
        const displayMediaUrl =
          media.media_url || media.thumbnail_url;

        if (!displayMediaUrl) {
          skippedCount += 1;
          continue;
        }

        await db.instagramPost.upsert({
          where: {
            instagramId: media.id,
          },
          create: {
            shop,
            instagramId: media.id,
            accountId: account.id,
            mediaUrl: displayMediaUrl,
            permalink: media.permalink,
            caption: media.caption,
            mediaType: media.media_type,
            thumbnailUrl: media.thumbnail_url,
            timestamp: media.timestamp
              ? new Date(media.timestamp)
              : undefined,
            isPublished: true,
          },
          update: {
            shop,
            accountId: account.id,
            mediaUrl: displayMediaUrl,
            permalink: media.permalink,
            caption: media.caption,
            mediaType: media.media_type,
            thumbnailUrl: media.thumbnail_url,
            timestamp: media.timestamp
              ? new Date(media.timestamp)
              : undefined,
          },
        });

        syncedCount += 1;
      }

      nextUrl = response.paging?.next;
    }

    const syncedAt = new Date();

    await db.instagramAccount.update({
      where: {
        id: account.id,
      },
      data: {
        username: profile.username ?? account.username,
        instagramId,
        pageId,
        connected: true,
        lastSyncedAt: syncedAt,
        lastSyncError: null,
      },
    });

    return {
      success: true,
      syncedCount,
      skippedCount,
      syncedAt,
      username: profile.username ?? account.username,
    };
  } catch (error) {
    const message = getErrorMessage(error);

    await db.instagramAccount.update({
      where: {
        id: account.id,
      },
      data: {
        lastSyncError: message,
      },
    });

    throw new Error(message);
  }
}