import db from "../db.server";

const META_GRAPH_API_VERSION =
  process.env.META_GRAPH_API_VERSION || "v25.0";

const META_GRAPH_API_BASE =
  `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;

const MAXIMUM_MEDIA_PAGES = 20;
const SYNC_LOCK_TIMEOUT_MINUTES = 15;
const TOKEN_EXPIRY_BUFFER_MINUTES = 5;

type MetaErrorPayload = {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
};

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
    cursors?: {
      before?: string;
      after?: string;
    };
    next?: string;
  };
  error?: MetaErrorPayload;
};

type MetaInstagramProfileResponse = {
  id?: string;
  username?: string;
  error?: MetaErrorPayload;
};

type InstagramAccountInput = {
  shop: string;
  pageId?: string;
  instagramId?: string;
  facebookUserId?: string;
  username?: string;
  accessToken?: string;
  tokenType?: string;
  tokenIssuedAt?: Date;
  tokenExpiresAt?: Date;
  grantedScopes?: string;
  connected?: boolean;
};

export class InstagramConnectionError extends Error {
  code: string;
  reconnectRequired: boolean;

  constructor(
    message: string,
    options?: {
      code?: string;
      reconnectRequired?: boolean;
    },
  ) {
    super(message);

    this.name = "InstagramConnectionError";
    this.code = options?.code || "INSTAGRAM_CONNECTION_ERROR";
    this.reconnectRequired = options?.reconnectRequired ?? false;
  }
}

class MetaApiError extends Error {
  status: number;
  type?: string;
  code?: number;
  errorSubcode?: number;
  traceId?: string;

  constructor({
    message,
    status,
    type,
    code,
    errorSubcode,
    traceId,
  }: {
    message: string;
    status: number;
    type?: string;
    code?: number;
    errorSubcode?: number;
    traceId?: string;
  }) {
    super(message);

    this.name = "MetaApiError";
    this.status = status;
    this.type = type;
    this.code = code;
    this.errorSubcode = errorSubcode;
    this.traceId = traceId;
  }
}

function normalizeShop(shop: string): string {
  return shop.trim().toLowerCase();
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown Instagram sync error.";
}

function getSyncErrorCode(error: unknown): string {
  if (error instanceof InstagramConnectionError) {
    return error.code;
  }

  if (error instanceof MetaApiError) {
    if (error.errorSubcode !== undefined) {
      return `META_${error.code ?? "UNKNOWN"}_${error.errorSubcode}`;
    }

    return `META_${error.code ?? "UNKNOWN"}`;
  }

  return "INSTAGRAM_SYNC_ERROR";
}

function isMetaAuthorizationError(error: unknown): boolean {
  if (!(error instanceof MetaApiError)) {
    return false;
  }

  /*
   * Common authorization failures:
   *
   * 102: Session key is invalid or no longer valid.
   * 190: Invalid or expired OAuth access token.
   * 200: Required permission is missing or was removed.
   */
  return (
    error.code === 102 ||
    error.code === 190 ||
    error.code === 200
  );
}

function isTokenExpiredOrNearExpiry(
  tokenExpiresAt: Date | null,
): boolean {
  if (!tokenExpiresAt) {
    return false;
  }

  const bufferMilliseconds =
    TOKEN_EXPIRY_BUFFER_MINUTES * 60 * 1000;

  return (
    tokenExpiresAt.getTime() <=
    Date.now() + bufferMilliseconds
  );
}

async function fetchMetaJson<T>(
  url: string,
): Promise<T> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  let result: T & {
    error?: MetaErrorPayload;
  };

  try {
    result = (await response.json()) as T & {
      error?: MetaErrorPayload;
    };
  } catch {
    throw new MetaApiError({
      message:
        `Meta API returned an invalid response with HTTP ` +
        `${response.status}.`,
      status: response.status,
    });
  }

  if (!response.ok || result.error) {
    throw new MetaApiError({
      message:
        result.error?.message ||
        `Meta API request failed with HTTP ${response.status}.`,
      status: response.status,
      type: result.error?.type,
      code: result.error?.code,
      errorSubcode: result.error?.error_subcode,
      traceId: result.error?.fbtrace_id,
    });
  }

  return result;
}

async function markReconnectRequired({
  accountId,
  message,
  errorCode,
  clearToken,
}: {
  accountId: string;
  message: string;
  errorCode: string;
  clearToken: boolean;
}) {
  await db.instagramAccount.update({
    where: {
      id: accountId,
    },
    data: {
      connected: false,
      reconnectRequired: true,
      disconnectedAt: new Date(),
      lastSyncError: message,
      lastSyncErrorCode: errorCode,
      syncInProgress: false,
      syncStartedAt: null,
      ...(clearToken
        ? {
            accessToken: null,
            tokenExpiresAt: null,
          }
        : {}),
    },
  });
}

async function acquireSyncLock(
  accountId: string,
): Promise<boolean> {
  const staleBefore = new Date(
    Date.now() -
      SYNC_LOCK_TIMEOUT_MINUTES * 60 * 1000,
  );

  const result = await db.instagramAccount.updateMany({
    where: {
      id: accountId,
      OR: [
        {
          syncInProgress: false,
        },
        {
          syncStartedAt: null,
        },
        {
          syncStartedAt: {
            lt: staleBefore,
          },
        },
      ],
    },
    data: {
      syncInProgress: true,
      syncStartedAt: new Date(),
    },
  });

  return result.count === 1;
}

async function releaseSyncLock(accountId: string) {
  await db.instagramAccount.updateMany({
    where: {
      id: accountId,
    },
    data: {
      syncInProgress: false,
      syncStartedAt: null,
    },
  });
}

export async function getInstagramPosts(shop: string) {
  return db.instagramPost.findMany({
    where: {
      shop: normalizeShop(shop),
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

export async function getInstagramPost(
  id: string,
  shop: string,
) {
  return db.instagramPost.findFirst({
    where: {
      id,
      shop: normalizeShop(shop),
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
      shop: normalizeShop(shop),
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
      shop: normalizeShop(shop),
    },
    data,
  });
}

export async function deleteInstagramPost(
  id: string,
  shop: string,
) {
  return db.instagramPost.deleteMany({
    where: {
      id,
      shop: normalizeShop(shop),
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
  const normalizedShop = normalizeShop(shop);

  const post = await db.instagramPost.findFirst({
    where: {
      id: postId,
      shop: normalizedShop,
    },
    select: {
      id: true,
    },
  });

  if (!post) {
    throw new Error(
      "Instagram post was not found for this store.",
    );
  }

  return db.instagramPostTag.create({
    data: {
      shop: normalizedShop,
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

export async function deleteInstagramPostTag(
  id: string,
  shop: string,
) {
  return db.instagramPostTag.deleteMany({
    where: {
      id,
      shop: normalizeShop(shop),
    },
  });
}

export async function getInstagramAccount(
  shop: string,
) {
  return db.instagramAccount.findUnique({
    where: {
      shop: normalizeShop(shop),
    },
  });
}

export async function upsertInstagramAccount({
  shop,
  pageId,
  instagramId,
  facebookUserId,
  username,
  accessToken,
  tokenType,
  tokenIssuedAt,
  tokenExpiresAt,
  grantedScopes,
  connected = true,
}: InstagramAccountInput) {
  const normalizedShop = normalizeShop(shop);
  const now = new Date();

  return db.instagramAccount.upsert({
    where: {
      shop: normalizedShop,
    },
    create: {
      shop: normalizedShop,
      pageId,
      instagramId,
      facebookUserId,
      username,
      accessToken,
      tokenType,
      tokenIssuedAt,
      tokenExpiresAt,
      grantedScopes,
      connected,
      reconnectRequired: false,
      connectedAt: connected ? now : null,
      disconnectedAt: connected ? null : now,
      lastTokenCheckedAt: now,
      lastSyncError: null,
      lastSyncErrorCode: null,
    },
    update: {
      pageId,
      instagramId,
      facebookUserId,
      username,
      accessToken,
      tokenType,
      tokenIssuedAt,
      tokenExpiresAt,
      grantedScopes,
      connected,
      reconnectRequired: false,
      connectedAt: connected ? now : undefined,
      disconnectedAt: connected ? null : now,
      lastTokenCheckedAt: now,
      lastSyncError: null,
      lastSyncErrorCode: null,
    },
  });
}

export async function disconnectInstagramAccount(
  shop: string,
) {
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
      reconnectRequired: false,
      disconnectedAt: new Date(),

      pageId: null,
      instagramId: null,
      facebookUserId: null,
      username: null,

      accessToken: null,
      tokenType: null,
      tokenIssuedAt: null,
      tokenExpiresAt: null,
      grantedScopes: null,

      syncInProgress: false,
      syncStartedAt: null,

      lastSyncError: null,
      lastSyncErrorCode: null,
    },
  });
}

export async function syncInstagramPosts(
  shop: string,
) {
  const normalizedShop = normalizeShop(shop);
  const account = await getInstagramAccount(
    normalizedShop,
  );

  if (!account) {
    throw new InstagramConnectionError(
      "Connect Instagram before syncing posts.",
      {
        code: "INSTAGRAM_NOT_CONNECTED",
        reconnectRequired: true,
      },
    );
  }

  if (
    !account.connected ||
    account.reconnectRequired
  ) {
    throw new InstagramConnectionError(
      "Instagram authorization is not active. Reconnect Instagram.",
      {
        code: "INSTAGRAM_RECONNECT_REQUIRED",
        reconnectRequired: true,
      },
    );
  }

  if (!account.accessToken) {
    await markReconnectRequired({
      accountId: account.id,
      message:
        "Instagram access token is missing. Reconnect Instagram.",
      errorCode: "INSTAGRAM_TOKEN_MISSING",
      clearToken: true,
    });

    throw new InstagramConnectionError(
      "Instagram access token is missing. Reconnect Instagram.",
      {
        code: "INSTAGRAM_TOKEN_MISSING",
        reconnectRequired: true,
      },
    );
  }

  if (!account.instagramId) {
    await markReconnectRequired({
      accountId: account.id,
      message:
        "No Instagram professional account is connected. Reconnect Instagram.",
      errorCode: "INSTAGRAM_ACCOUNT_ID_MISSING",
      clearToken: false,
    });

    throw new InstagramConnectionError(
      "No Instagram professional account is connected. Reconnect Instagram.",
      {
        code: "INSTAGRAM_ACCOUNT_ID_MISSING",
        reconnectRequired: true,
      },
    );
  }

  if (
    isTokenExpiredOrNearExpiry(
      account.tokenExpiresAt,
    )
  ) {
    await markReconnectRequired({
      accountId: account.id,
      message:
        "Instagram authorization has expired. Reconnect Instagram.",
      errorCode: "INSTAGRAM_TOKEN_EXPIRED",
      clearToken: true,
    });

    throw new InstagramConnectionError(
      "Instagram authorization has expired. Reconnect Instagram.",
      {
        code: "INSTAGRAM_TOKEN_EXPIRED",
        reconnectRequired: true,
      },
    );
  }

  const lockAcquired = await acquireSyncLock(
    account.id,
  );

  if (!lockAcquired) {
    throw new InstagramConnectionError(
      "Instagram posts are already being synced. Wait a moment and try again.",
      {
        code: "INSTAGRAM_SYNC_IN_PROGRESS",
      },
    );
  }

  try {
    const profileParams = new URLSearchParams({
      fields: "id,username",
      access_token: account.accessToken,
    });

    const profileUrl =
      `${META_GRAPH_API_BASE}/${account.instagramId}` +
      `?${profileParams.toString()}`;

    const profile =
      await fetchMetaJson<MetaInstagramProfileResponse>(
        profileUrl,
      );

    const mediaParams = new URLSearchParams({
      fields:
        "id,caption,media_type,media_url," +
        "thumbnail_url,permalink,timestamp",
      limit: "100",
      access_token: account.accessToken,
    });

    let nextUrl: string | undefined =
      `${META_GRAPH_API_BASE}/${account.instagramId}/media` +
      `?${mediaParams.toString()}`;

    let syncedCount = 0;
    let skippedCount = 0;
    let pageCount = 0;

    while (
      nextUrl &&
      pageCount < MAXIMUM_MEDIA_PAGES
    ) {
      pageCount += 1;

      const response =
        await fetchMetaJson<MetaMediaResponse>(
          nextUrl,
        );

      const mediaItems = response.data ?? [];

      for (const media of mediaItems) {
        const displayMediaUrl =
          media.media_url ||
          media.thumbnail_url;

        if (!displayMediaUrl) {
          skippedCount += 1;
          continue;
        }

        const mediaTimestamp =
          media.timestamp
            ? new Date(media.timestamp)
            : undefined;

        if (
          mediaTimestamp &&
          Number.isNaN(mediaTimestamp.getTime())
        ) {
          skippedCount += 1;
          continue;
        }

        await db.instagramPost.upsert({
          where: {
            instagramId: media.id,
          },
          create: {
            shop: normalizedShop,
            instagramId: media.id,
            accountId: account.id,
            mediaUrl: displayMediaUrl,
            permalink: media.permalink,
            caption: media.caption,
            mediaType: media.media_type,
            thumbnailUrl: media.thumbnail_url,
            timestamp: mediaTimestamp,
            isPublished: true,
          },
          update: {
            shop: normalizedShop,
            accountId: account.id,
            mediaUrl: displayMediaUrl,
            permalink: media.permalink,
            caption: media.caption,
            mediaType: media.media_type,
            thumbnailUrl: media.thumbnail_url,
            timestamp: mediaTimestamp,
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
        username:
          profile.username ??
          account.username,

        instagramId:
          profile.id ??
          account.instagramId,

        connected: true,
        reconnectRequired: false,
        disconnectedAt: null,

        lastTokenCheckedAt: syncedAt,
        lastSyncedAt: syncedAt,
        lastSyncError: null,
        lastSyncErrorCode: null,

        syncInProgress: false,
        syncStartedAt: null,
      },
    });

    return {
      success: true,
      syncedCount,
      skippedCount,
      pageCount,
      syncedAt,
      username:
        profile.username ??
        account.username,
    };
  } catch (error) {
    const message = getErrorMessage(error);
    const errorCode = getSyncErrorCode(error);
    const authorizationError =
      isMetaAuthorizationError(error);

    if (authorizationError) {
      await markReconnectRequired({
        accountId: account.id,
        message,
        errorCode,
        clearToken:
          error instanceof MetaApiError &&
          (error.code === 102 ||
            error.code === 190),
      });

      throw new InstagramConnectionError(
        `${message} Reconnect Instagram.`,
        {
          code: errorCode,
          reconnectRequired: true,
        },
      );
    }

    await db.instagramAccount.update({
      where: {
        id: account.id,
      },
      data: {
        lastSyncError: message,
        lastSyncErrorCode: errorCode,
        syncInProgress: false,
        syncStartedAt: null,
      },
    });

    throw new InstagramConnectionError(
      message,
      {
        code: errorCode,
      },
    );
  } finally {
    /*
     * This is intentionally updateMany so cleanup does not throw
     * if the account was removed while the sync was running.
     */
    await releaseSyncLock(account.id).catch(
      (releaseError) => {
        console.error(
          "Could not release Instagram sync lock:",
          getErrorMessage(releaseError),
        );
      },
    );
  }
}