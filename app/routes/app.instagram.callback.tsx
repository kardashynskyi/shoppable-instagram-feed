import type {
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";

import {
  redirect,
} from "react-router";

import {
  boundary,
} from "@shopify/shopify-app-react-router/server";

import {
  upsertInstagramAccount,
} from "../models/instagram-feed.server";


const META_GRAPH_API_VERSION =
  process.env.META_GRAPH_API_VERSION || "v25.0";

const META_GRAPH_API_BASE =
  `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;

const MAXIMUM_STATE_AGE_MS =
  15 * 60 * 1000;


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


type MetaBusinessResponse = {
  data?: {
    id?: string;
    name?: string;
  }[];
  error?: MetaError;
};


function requireEnvironmentVariable(
  name: string,
): string {
  const value =
    process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `${name} is missing from the server environment.`,
    );
  }

  return value;
}


function getErrorMessage(
  error: unknown,
): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Instagram connection failed.";
}


function parseOAuthState(
  value: string | null,
): OAuthState {
  if (!value) {
    throw new Error(
      "The Meta OAuth state parameter is missing.",
    );
  }

  let parsed: unknown;

  try {
    const decoded =
      Buffer.from(
        value,
        "base64url",
      ).toString("utf8");

    parsed =
      JSON.parse(decoded);
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

  const shop =
    String(parsed.shop || "")
      .trim()
      .toLowerCase();

  const host =
    String(parsed.host || "")
      .trim();

  const createdAt =
    Number(parsed.createdAt);

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
    Date.now() - createdAt >
      MAXIMUM_STATE_AGE_MS
  ) {
    throw new Error(
      "The Meta OAuth request has expired. " +
      "Start the connection again.",
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
  const response =
    await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

  const result =
    await response.json() as T & {
      error?: MetaError;
    };

  if (
    !response.ok ||
    result.error
  ) {
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
  const params =
    new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code,
    });

  return fetchMetaJson<MetaTokenResponse>(
    `${META_GRAPH_API_BASE}/oauth/access_token?${params}`,
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
  const params =
    new URLSearchParams({
      grant_type:
        "fb_exchange_token",
      client_id:
        appId,
      client_secret:
        appSecret,
      fb_exchange_token:
        shortLivedToken,
    });

  return fetchMetaJson<MetaTokenResponse>(
    `${META_GRAPH_API_BASE}/oauth/access_token?${params}`,
  );
}


async function getFacebookUserId(
  accessToken: string,
) {
  const params =
    new URLSearchParams({
      fields:
        "id",
      access_token:
        accessToken,
    });

  const result =
    await fetchMetaJson<MetaUserResponse>(
      `${META_GRAPH_API_BASE}/me?${params}`,
    );

  return result.id;
}


async function getFacebookPages(
  accessToken: string,
): Promise<MetaPage[]> {
  const pages: MetaPage[] = [];

  const params =
    new URLSearchParams({
      fields:
        "id,name,access_token," +
        "instagram_business_account{id,username}",
      limit:
        "100",
      access_token:
        accessToken,
    });

  let nextUrl =
    `${META_GRAPH_API_BASE}/me/accounts?${params}`;

  while (nextUrl) {
    const result =
      await fetchMetaJson<MetaPagesResponse>(
        nextUrl,
      );

    pages.push(
      ...(result.data ?? []),
    );

    nextUrl =
      result.paging?.next || "";
  }

  return pages;
}


async function getBusinessPages(
  accessToken: string,
): Promise<MetaPage[]> {
  const pages: MetaPage[] = [];

  const businessResult =
    await fetchMetaJson<MetaBusinessResponse>(
      `${META_GRAPH_API_BASE}/me/businesses?` +
      new URLSearchParams({
        fields:
          "id,name",
        access_token:
          accessToken,
      }),
    );

  for (
    const business of
      businessResult.data ?? []
  ) {
    if (!business.id) {
      continue;
    }

    const pageResult =
      await fetchMetaJson<MetaPagesResponse>(
        `${META_GRAPH_API_BASE}/${business.id}/owned_pages?` +
        new URLSearchParams({
          fields:
            "id,name,access_token," +
            "instagram_business_account{id,username}",
          access_token:
            accessToken,
        }),
      );

    pages.push(
      ...(pageResult.data ?? []),
    );
  }

  return pages;
}
function sanitizePagesForLog(
  pages: MetaPage[],
) {
  return pages.map(
    (page) => ({
      id:
        page.id,
      name:
        page.name,
      hasPageAccessToken:
        Boolean(page.access_token),
      instagramBusinessAccount:
        page.instagram_business_account
          ? {
              id:
                page.instagram_business_account.id,
              username:
                page.instagram_business_account.username,
            }
          : null,
    }),
  );
}


function selectInstagramPage(
  pages: MetaPage[],
): MetaPage {
  const connectedPages =
    pages.filter(
      (page) =>
        Boolean(page.id) &&
        Boolean(page.access_token) &&
        Boolean(
          page.instagram_business_account?.id,
        ),
    );


  if (
    connectedPages.length === 0
  ) {
    throw new Error(
      "No Instagram professional account was found. " +
      "Connect an Instagram Business or Creator account " +
      "to a Facebook Page and try again.",
    );
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
  const params =
    new URLSearchParams({
      shop:
        state.shop,
      host:
        state.host,
      embedded:
        "1",
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
      message ||
        "Instagram connection failed.",
    );
  }


  return (
    `/app/instagram?${params.toString()}`
  );
}


export const loader = async ({
  request,
}: LoaderFunctionArgs) => {

  const requestUrl =
    new URL(request.url);


  const code =
    requestUrl.searchParams.get(
      "code",
    );

  const stateValue =
    requestUrl.searchParams.get(
      "state",
    );


  let state: OAuthState;


  try {
    state =
      parseOAuthState(
        stateValue,
      );
  } catch (error) {
    return redirect(
      `/app/instagram?instagramConnection=error&instagramError=${encodeURIComponent(
        getErrorMessage(error),
      )}`,
    );
  }


  if (!code) {
    return redirect(
      buildInstagramRedirect({
        state,
        success: false,
        message:
          "Meta did not return an authorization code.",
      }),
    );
  }


  try {

    const metaAppId =
      requireEnvironmentVariable(
        "META_APP_ID",
      );

    const metaAppSecret =
      requireEnvironmentVariable(
        "META_APP_SECRET",
      );

    const metaRedirectUri =
      requireEnvironmentVariable(
        "META_REDIRECT_URI",
      );


    const shortTokenResponse =
      await exchangeAuthorizationCode({
        code,
        appId:
          metaAppId,
        appSecret:
          metaAppSecret,
        redirectUri:
          metaRedirectUri,
      });


    if (
      !shortTokenResponse.access_token
    ) {
      throw new Error(
        "Meta did not return an access token.",
      );
    }


    const longTokenResponse =
      await exchangeLongLivedToken({
        shortLivedToken:
          shortTokenResponse.access_token,
        appId:
          metaAppId,
        appSecret:
          metaAppSecret,
      });


    const shortToken =
      shortTokenResponse.access_token;


    const longToken =
      longTokenResponse.access_token ||
      shortToken;


    console.log(
      "META TOKEN DEBUG",
      {
        short:
          Boolean(shortToken),
        long:
          Boolean(longTokenResponse.access_token),
      },
    );


    let pages =
      await getFacebookPages(
        longToken,
      );


    console.log(
      "DIRECT PAGE RESULT",
      JSON.stringify(
        sanitizePagesForLog(
          pages,
        ),
        null,
        2,
      ),
    );


    if (
      pages.length === 0
    ) {

      pages =
        await getBusinessPages(
          longToken,
        );


      console.log(
        "BUSINESS PAGE RESULT",
        JSON.stringify(
          sanitizePagesForLog(
            pages,
          ),
          null,
          2,
        ),
      );
    }


    const selectedPage =
      selectInstagramPage(
        pages,
      );


    const instagramAccount =
      selectedPage.instagram_business_account;


    if (
      !selectedPage.id ||
      !selectedPage.access_token ||
      !instagramAccount?.id
    ) {
      throw new Error(
        "Selected Page does not have Instagram account data.",
      );
    }


    const facebookUserId =
      await getFacebookUserId(
        longToken,
      );


    await upsertInstagramAccount({
      shop:
        state.shop,

      pageId:
        selectedPage.id,

      instagramId:
        instagramAccount.id,

      facebookUserId,

      username:
        instagramAccount.username,

      accessToken:
        selectedPage.access_token,

      tokenType:
        "bearer",

      tokenIssuedAt:
        new Date(),

      grantedScopes:
        [
          "pages_show_list",
          "pages_read_engagement",
          "instagram_basic",
          "business_management",
        ].join(","),

      connected:
        true,
    });


    return redirect(
      buildInstagramRedirect({
        state,
        success: true,
      }),
    );


  } catch (error) {

    console.error(
      "Instagram OAuth callback failed:",
      error,
    );


    return redirect(
      buildInstagramRedirect({
        state,
        success: false,
        message:
          getErrorMessage(error),
      }),
    );
  }
};


export default function InstagramCallbackRoute() {
  return null;
}


export const headers:
  HeadersFunction = (
    headersArgs,
  ) => {
    return boundary.headers(
      headersArgs,
    );
  };