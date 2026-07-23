import type {
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { redirect } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { upsertInstagramAccount } from "../models/instagram-feed.server";

const META_GRAPH_API_VERSION =
  process.env.META_GRAPH_API_VERSION || "v25.0";

const META_GRAPH_API_BASE =
  `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;

const MAXIMUM_STATE_AGE_MS = 15 * 60 * 1000;

type OAuthState = {
  shop: string;
  host: string;
  createdAt: number;
};

type MetaError = {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
};

type MetaTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: MetaError;
};

type MetaUserResponse = {
  id?: string;
  error?: MetaError;
};

type MetaInstagramAccount = {
  id?: string;
  username?: string;
};

type MetaPage = {
  id?: string;
  name?: string;
  access_token?: string;
  instagram_business_account?: MetaInstagramAccount;
};

type MetaPagesResponse = {
  data?: MetaPage[];
  paging?: {
    next?: string;
  };
  error?: MetaError;
};

function requireEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `${name} is missing from the server environment.`,
    );
  }

  return value;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Instagram connection failed.";
}

function parseOAuthState(value: string | null): OAuthState {
  if (!value) {
    throw new Error(
      "The Meta OAuth state parameter is missing.",
    );
  }

  let parsed: unknown;

  try {
    const decoded = Buffer.from(
      value,
      "base64url",
    ).toString("utf8");

    parsed = JSON.parse(decoded);
  } catch {
    throw new Error(
      "The Meta OAuth state has an invalid format.",
    );
  }

  if (
  typeof parsed !== "object" ||
  parsed === null ||
  !("shop" in parsed) ||
  !("host" in parsed) ||
  !("createdAt" in parsed)
) {
  throw new Error(
    "The Meta OAuth state is invalid.",
  );
}

  const shop = String(parsed.shop || "")
  .trim()
  .toLowerCase();

const host = String(parsed.host || "").trim();

const createdAt = Number(parsed.createdAt);

  if (
  !shop ||
  !shop.endsWith(".myshopify.com") ||
  !host ||
  !Number.isFinite(createdAt)
) {
    throw new Error(
      "The Meta OAuth state is invalid.",
    );
  }

  if (
    createdAt > Date.now() ||
    Date.now() - createdAt > MAXIMUM_STATE_AGE_MS
  ) {
    throw new Error(
      "The Meta OAuth request has expired. Start the connection again.",
    );
  }

  return {
  shop,
  host,
  createdAt,
};
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
    error?: MetaError;
  };

  try {
    result = (await response.json()) as T & {
      error?: MetaError;
    };
  } catch {
    throw new Error(
      `Meta returned an invalid response with HTTP ${response.status}.`,
    );
  }

  if (!response.ok || result.error) {
    throw new Error(
      result.error?.message ||
        `Meta request failed with HTTP ${response.status}.`,
    );
  }

  return result;
}

async function exchangeAuthorizationCode({
  code,
  appId,
  appSecret,
  redirectUri,
}: {
  code: string;
  appId: string;
  appSecret: string;
  redirectUri: string;
}) {
  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code,
  });

  return fetchMetaJson<MetaTokenResponse>(
    `${META_GRAPH_API_BASE}/oauth/access_token?${params.toString()}`,
  );
}

async function exchangeLongLivedToken({
  shortLivedToken,
  appId,
  appSecret,
}: {
  shortLivedToken: string;
  appId: string;
  appSecret: string;
}) {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortLivedToken,
  });

  return fetchMetaJson<MetaTokenResponse>(
    `${META_GRAPH_API_BASE}/oauth/access_token?${params.toString()}`,
  );
}

async function getFacebookUserId(
  accessToken: string,
): Promise<string | undefined> {
  const params = new URLSearchParams({
    fields: "id",
    access_token: accessToken,
  });

  const result = await fetchMetaJson<MetaUserResponse>(
    `${META_GRAPH_API_BASE}/me?${params.toString()}`,
  );

  return result.id;
}

async function getFacebookPages(
  accessToken: string,
): Promise<MetaPage[]> {
  const pages: MetaPage[] = [];

  const params = new URLSearchParams({
    fields:
      "id,name,access_token," +
      "instagram_business_account{id,username}",
    limit: "100",
    access_token: accessToken,
  });

  let nextUrl: string | undefined =
    `${META_GRAPH_API_BASE}/me/accounts?${params.toString()}`;

  while (nextUrl) {
    const result =
      await fetchMetaJson<MetaPagesResponse>(nextUrl);

    pages.push(...(result.data ?? []));
    nextUrl = result.paging?.next;
  }

  return pages;
}

function selectInstagramPage(
  pages: MetaPage[],
): MetaPage {
  const connectedPages = pages.filter(
    (page) =>
      Boolean(page.id) &&
      Boolean(page.access_token) &&
      Boolean(page.instagram_business_account?.id),
  );

  if (connectedPages.length === 0) {
    throw new Error(
      "No Instagram professional account was found. " +
        "Connect an Instagram Business or Creator account " +
        "to a Facebook Page and try again.",
    );
  }

  const preferredInstagramId =
    process.env.META_PREFERRED_INSTAGRAM_ACCOUNT_ID?.trim();

  if (preferredInstagramId) {
    const preferredPage = connectedPages.find(
      (page) =>
        page.instagram_business_account?.id ===
        preferredInstagramId,
    );

    if (!preferredPage) {
      throw new Error(
        "The preferred Instagram account was not found " +
          "among the Facebook Pages authorized by this user.",
      );
    }

    return preferredPage;
  }

  return connectedPages[0];
}

function buildInstagramRedirect({
  state,
  success,
  message,
}: {
  state: OAuthState;
  success: boolean;
  message?: string;
}) {
  const params = new URLSearchParams({
    shop: state.shop,
    host: state.host,
    embedded: "1",
  });

  if (success) {
    params.set(
      "instagramConnection",
      "success",
    );
  } else {
    params.set(
      "instagramConnection",
      "error",
    );

    params.set(
      "instagramError",
      message || "Instagram connection failed.",
    );
  }

  return `https://admin.shopify.com/store/${state.shop.replace(
  ".myshopify.com",
  "",
)}/apps/${process.env.SHOPIFY_API_KEY}/app/instagram?${params.toString()}`;
}

export const loader = async ({
  request,
}: LoaderFunctionArgs) => {
  const requestUrl = new URL(request.url);

  const code = requestUrl.searchParams.get("code");
  const stateValue =
    requestUrl.searchParams.get("state");

  const metaError =
    requestUrl.searchParams.get("error");

  const metaErrorDescription =
    requestUrl.searchParams.get(
      "error_description",
    );

  let state: OAuthState;

  try {
    state = parseOAuthState(stateValue);
  } catch (error) {
    return redirect(
      buildInstagramRedirect({
  success: false,
  message: getErrorMessage(error),
})
    );
  }

  if (metaError) {
    return redirect(
      buildInstagramRedirect({
        success: false,
        message:
          metaErrorDescription ||
          `Meta authorization failed: ${metaError}.`,
      }),
    );
  }

  if (!code) {
    return redirect(
      buildInstagramRedirect({
        success: false,
        message:
          "Meta did not return an authorization code.",
      }),
    );
  }

  try {
    const metaAppId =
      requireEnvironmentVariable("META_APP_ID");

    const metaAppSecret =
      requireEnvironmentVariable("META_APP_SECRET");

    const metaRedirectUri =
      requireEnvironmentVariable("META_REDIRECT_URI");

    const shortLivedTokenResponse =
      await exchangeAuthorizationCode({
        code,
        appId: metaAppId,
        appSecret: metaAppSecret,
        redirectUri: metaRedirectUri,
      });

    if (!shortLivedTokenResponse.access_token) {
      throw new Error(
        "Meta did not return an access token.",
      );
    }

    const longLivedTokenResponse =
      await exchangeLongLivedToken({
        shortLivedToken:
          shortLivedTokenResponse.access_token,
        appId: metaAppId,
        appSecret: metaAppSecret,
      });

    const facebookUserAccessToken =
      longLivedTokenResponse.access_token ||
      shortLivedTokenResponse.access_token;

    if (!facebookUserAccessToken) {
      throw new Error(
        "Meta did not return a usable access token.",
      );
    }

    const [facebookUserId, pages] =
      await Promise.all([
        getFacebookUserId(
          facebookUserAccessToken,
        ),
        getFacebookPages(
          facebookUserAccessToken,
        ),
      ]);

    const selectedPage =
      selectInstagramPage(pages);

    const instagramAccount =
      selectedPage.instagram_business_account;

    if (
      !selectedPage.id ||
      !selectedPage.access_token ||
      !instagramAccount?.id
    ) {
      throw new Error(
        "The selected Facebook Page does not have " +
          "a usable Instagram professional account.",
      );
    }

    const issuedAt = new Date();

    const expiresInSeconds =
      longLivedTokenResponse.expires_in ??
      shortLivedTokenResponse.expires_in;

    const tokenExpiresAt =
      typeof expiresInSeconds === "number" &&
      expiresInSeconds > 0
        ? new Date(
            issuedAt.getTime() +
              expiresInSeconds * 1000,
          )
        : undefined;

    await upsertInstagramAccount({
      shop: state.shop,
      pageId: selectedPage.id,
      instagramId: instagramAccount.id,
      facebookUserId,
      username: instagramAccount.username,
      accessToken: selectedPage.access_token,
      tokenType:
        longLivedTokenResponse.token_type ||
        shortLivedTokenResponse.token_type ||
        "bearer",
      tokenIssuedAt: issuedAt,
      tokenExpiresAt,
      grantedScopes: [
        "pages_show_list",
        "pages_read_engagement",
        "instagram_basic",
      ].join(","),
      connected: true,
    });

    return redirect(
      buildInstagramRedirect({
  state,
  success: true,
})
    );
  } catch (error) {
    console.error(
      "Instagram OAuth callback failed:",
      error,
    );

    return redirect(
      buildInstagramRedirect({
  success: false,
  message: getErrorMessage(error),
})
    );
  }
};

export default function InstagramCallbackRoute() {
  return null;
}

export const headers: HeadersFunction = (
  headersArgs,
) => {
  return boundary.headers(headersArgs);
};