import crypto from "node:crypto";

const DEFAULT_GRAPH_API_VERSION = "v25.0";
const STATE_LIFETIME_SECONDS = 10 * 60;

const META_PERMISSIONS = [
  "pages_show_list",
  "pages_read_engagement",
  "instagram_basic",
] as const;

type OAuthStatePayload = {
  shop: string;
  issuedAt: number;
  expiresAt: number;
};

type MetaTokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
};

type MetaApiErrorBody = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

type MetaPage = {
  id: string;
  name?: string;
  access_token?: string;
  instagram_business_account?: {
    id: string;
    username?: string;
  } | null;
};

type MetaPagesResponse = {
  data?: MetaPage[];
  paging?: {
    next?: string;
  };
};

export type ConnectedInstagramAccount = {
  facebookUserAccessToken: string;
  pageAccessToken: string;
  tokenExpiresAt: Date | null;
  pageId: string;
  pageName: string | null;
  instagramId: string;
  username: string | null;
};

export class MetaApiError extends Error {
  status: number;
  code: number | null;
  subcode: number | null;
  type: string | null;
  traceId: string | null;

  constructor(args: {
    message: string;
    status: number;
    code?: number | null;
    subcode?: number | null;
    type?: string | null;
    traceId?: string | null;
  }) {
    super(args.message);
    this.name = "MetaApiError";
    this.status = args.status;
    this.code = args.code ?? null;
    this.subcode = args.subcode ?? null;
    this.type = args.type ?? null;
    this.traceId = args.traceId ?? null;
  }
}

function requireEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is missing from the server environment.`);
  }

  return value;
}

function getGraphApiVersion(): string {
  return (
    process.env.META_GRAPH_API_VERSION?.trim() ||
    DEFAULT_GRAPH_API_VERSION
  );
}

function getMetaAppId(): string {
  return requireEnvironmentVariable("META_APP_ID");
}

function getMetaAppSecret(): string {
  return requireEnvironmentVariable("META_APP_SECRET");
}

export function getMetaRedirectUri(): string {
  return requireEnvironmentVariable("META_REDIRECT_URI");
}

function base64UrlEncode(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function createStateSignature(encodedPayload: string): string {
  return crypto
    .createHmac("sha256", getMetaAppSecret())
    .update(encodedPayload)
    .digest("base64url");
}

function signaturesMatch(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function assertValidShopDomain(shop: string): void {
  const validShopDomain =
    /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;

  if (!validShopDomain.test(shop)) {
    throw new Error("The OAuth state contains an invalid Shopify domain.");
  }
}

export function createMetaOAuthState(shop: string): string {
  assertValidShopDomain(shop);

  const issuedAt = Math.floor(Date.now() / 1000);

  const payload: OAuthStatePayload = {
    shop,
    issuedAt,
    expiresAt: issuedAt + STATE_LIFETIME_SECONDS,
  };

  const encodedPayload = base64UrlEncode(
    JSON.stringify(payload),
  );

  const signature = createStateSignature(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

export function verifyMetaOAuthState(
  state: string,
): OAuthStatePayload {
  const [encodedPayload, suppliedSignature, extraPart] =
    state.split(".");

  if (!encodedPayload || !suppliedSignature || extraPart) {
    throw new Error("The Meta OAuth state has an invalid format.");
  }

  const expectedSignature =
    createStateSignature(encodedPayload);

  if (!signaturesMatch(suppliedSignature, expectedSignature)) {
    throw new Error("The Meta OAuth state signature is invalid.");
  }

  let payload: OAuthStatePayload;

  try {
    payload = JSON.parse(
      base64UrlDecode(encodedPayload),
    ) as OAuthStatePayload;
  } catch {
    throw new Error("The Meta OAuth state payload is invalid.");
  }

  if (
    !payload ||
    typeof payload.shop !== "string" ||
    typeof payload.issuedAt !== "number" ||
    typeof payload.expiresAt !== "number"
  ) {
    throw new Error("The Meta OAuth state payload is incomplete.");
  }

  assertValidShopDomain(payload.shop);

  const currentTime = Math.floor(Date.now() / 1000);

  if (payload.expiresAt < currentTime) {
    throw new Error(
      "The Meta authorization request has expired. Please try connecting again.",
    );
  }

  if (payload.issuedAt > currentTime + 60) {
    throw new Error(
      "The Meta authorization request has an invalid timestamp.",
    );
  }

  return payload;
}

export function buildMetaAuthorizationUrl(shop: string): string {
  const state = createMetaOAuthState(shop);
  const graphApiVersion = getGraphApiVersion();

  const authorizationUrl = new URL(
    `https://www.facebook.com/${graphApiVersion}/dialog/oauth`,
  );

  authorizationUrl.searchParams.set(
    "client_id",
    getMetaAppId(),
  );

  authorizationUrl.searchParams.set(
    "redirect_uri",
    getMetaRedirectUri(),
  );

  authorizationUrl.searchParams.set(
    "response_type",
    "code",
  );

  authorizationUrl.searchParams.set(
    "scope",
    META_PERMISSIONS.join(","),
  );

  authorizationUrl.searchParams.set("state", state);

  return authorizationUrl.toString();
}

async function parseMetaResponse<T>(
  response: Response,
): Promise<T> {
  const body = (await response.json()) as
    | T
    | MetaApiErrorBody;

  if (!response.ok || "error" in (body as object)) {
    const errorBody = body as MetaApiErrorBody;
    const metaError = errorBody.error;

    throw new MetaApiError({
      message:
        metaError?.message ||
        `Meta returned HTTP ${response.status}.`,
      status: response.status,
      code: metaError?.code,
      subcode: metaError?.error_subcode,
      type: metaError?.type,
      traceId: metaError?.fbtrace_id,
    });
  }

  return body as T;
}

async function exchangeAuthorizationCode(
  code: string,
): Promise<MetaTokenResponse> {
  const graphApiVersion = getGraphApiVersion();

  const tokenUrl = new URL(
    `https://graph.facebook.com/${graphApiVersion}/oauth/access_token`,
  );

  tokenUrl.searchParams.set("client_id", getMetaAppId());
  tokenUrl.searchParams.set(
    "client_secret",
    getMetaAppSecret(),
  );
  tokenUrl.searchParams.set(
    "redirect_uri",
    getMetaRedirectUri(),
  );
  tokenUrl.searchParams.set("code", code);

  const response = await fetch(tokenUrl, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  return parseMetaResponse<MetaTokenResponse>(response);
}

async function exchangeForLongLivedToken(
  shortLivedAccessToken: string,
): Promise<MetaTokenResponse> {
  const graphApiVersion = getGraphApiVersion();

  const tokenUrl = new URL(
    `https://graph.facebook.com/${graphApiVersion}/oauth/access_token`,
  );

  tokenUrl.searchParams.set(
    "grant_type",
    "fb_exchange_token",
  );
  tokenUrl.searchParams.set("client_id", getMetaAppId());
  tokenUrl.searchParams.set(
    "client_secret",
    getMetaAppSecret(),
  );
  tokenUrl.searchParams.set(
    "fb_exchange_token",
    shortLivedAccessToken,
  );

  const response = await fetch(tokenUrl, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  return parseMetaResponse<MetaTokenResponse>(response);
}

function calculateTokenExpiration(
  expiresIn?: number,
): Date | null {
  if (
    typeof expiresIn !== "number" ||
    !Number.isFinite(expiresIn) ||
    expiresIn <= 0
  ) {
    return null;
  }

  return new Date(Date.now() + expiresIn * 1000);
}

function createAppSecretProof(accessToken: string): string {
  return crypto
    .createHmac("sha256", getMetaAppSecret())
    .update(accessToken)
    .digest("hex");
}

async function getFacebookPages(
  accessToken: string,
): Promise<MetaPage[]> {
  const graphApiVersion = getGraphApiVersion();

  const pagesUrl = new URL(
    `https://graph.facebook.com/${graphApiVersion}/me/accounts`,
  );

  pagesUrl.searchParams.set(
    "fields",
    [
      "id",
      "name",
      "access_token",
      "instagram_business_account{id,username}",
    ].join(","),
  );

  pagesUrl.searchParams.set("limit", "100");
  pagesUrl.searchParams.set("access_token", accessToken);
  pagesUrl.searchParams.set(
    "appsecret_proof",
    createAppSecretProof(accessToken),
  );

  const pages: MetaPage[] = [];
  let nextUrl: string | null = pagesUrl.toString();

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    const result =
      await parseMetaResponse<MetaPagesResponse>(response);

    if (Array.isArray(result.data)) {
      pages.push(...result.data);
    }

    nextUrl = result.paging?.next ?? null;
  }

  return pages;
}

function selectInstagramPage(pages: MetaPage[]): MetaPage {
  const preferredInstagramId =
    process.env.META_PREFERRED_INSTAGRAM_ACCOUNT_ID?.trim();

  const connectedPages = pages.filter(
    (page) =>
      Boolean(page.instagram_business_account?.id) &&
      Boolean(page.access_token),
  );

  if (connectedPages.length === 0) {
    throw new Error(
      "No Instagram professional account was found. Connect an Instagram Business or Creator account to a Facebook Page, then try again.",
    );
  }

  if (preferredInstagramId) {
    const preferredPage = connectedPages.find(
      (page) =>
        page.instagram_business_account?.id ===
        preferredInstagramId,
    );

    if (!preferredPage) {
      throw new Error(
        `Instagram account ${preferredInstagramId} was not available in the authorized Facebook Pages.`,
      );
    }

    return preferredPage;
  }

  if (connectedPages.length > 1) {
    const availableAccounts = connectedPages
      .map((page) => {
        const username =
          page.instagram_business_account?.username;

        return username
          ? `@${username}`
          : page.instagram_business_account?.id;
      })
      .filter(Boolean)
      .join(", ");

    throw new Error(
      `Multiple Instagram accounts were found: ${availableAccounts}. Configure META_PREFERRED_INSTAGRAM_ACCOUNT_ID before connecting.`,
    );
  }

  return connectedPages[0];
}

export async function completeMetaOAuth(
  code: string,
): Promise<ConnectedInstagramAccount> {
  if (!code.trim()) {
    throw new Error(
      "Meta did not return an authorization code.",
    );
  }

  const shortLivedToken =
    await exchangeAuthorizationCode(code);

  const longLivedToken =
    await exchangeForLongLivedToken(
      shortLivedToken.access_token,
    );

  const pages = await getFacebookPages(
    longLivedToken.access_token,
  );

  const selectedPage = selectInstagramPage(pages);
  const instagramAccount =
    selectedPage.instagram_business_account;

  if (
    !selectedPage.access_token ||
    !instagramAccount?.id
  ) {
    throw new Error(
      "The selected Facebook Page does not contain usable Instagram credentials.",
    );
  }

  return {
    facebookUserAccessToken:
      longLivedToken.access_token,
    pageAccessToken: selectedPage.access_token,
    tokenExpiresAt: calculateTokenExpiration(
      longLivedToken.expires_in,
    ),
    pageId: selectedPage.id,
    pageName: selectedPage.name ?? null,
    instagramId: instagramAccount.id,
    username: instagramAccount.username ?? null,
  };
}

export function formatMetaError(error: unknown): string {
  if (error instanceof MetaApiError) {
    const details = [
      error.code !== null
        ? `code ${error.code}`
        : null,
      error.subcode !== null
        ? `subcode ${error.subcode}`
        : null,
      error.traceId
        ? `trace ${error.traceId}`
        : null,
    ].filter(Boolean);

    return details.length > 0
      ? `${error.message} (${details.join(", ")})`
      : error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "An unknown Meta authorization error occurred.";
}