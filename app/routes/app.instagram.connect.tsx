import type {
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";

const META_GRAPH_API_VERSION =
  process.env.META_GRAPH_API_VERSION || "v25.0";

const META_OAUTH_URL =
  `https://www.facebook.com/${META_GRAPH_API_VERSION}/dialog/oauth`;

const META_PERMISSIONS = [
  "pages_show_list",
  "pages_read_engagement",
  "instagram_basic",
];

function requireEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `${name} is missing from the server environment.`,
    );
  }

  return value;
}

export const loader = async ({
  request,
}: LoaderFunctionArgs) => {
  const { session, redirect } =
    await authenticate.admin(request);

  const requestUrl = new URL(request.url);

  const host =
    requestUrl.searchParams.get("host")?.trim();

  if (!host) {
    throw new Error(
      "Shopify host parameter is missing. Open the app through Shopify Admin.",
    );
  }

  const metaAppId =
    requireEnvironmentVariable("META_APP_ID");

  const metaRedirectUri =
    requireEnvironmentVariable("META_REDIRECT_URI");

  const state = Buffer.from(
    JSON.stringify({
      shop: session.shop,
      host,
      createdAt: Date.now(),
    }),
    "utf8",
  ).toString("base64url");

  const authorizationUrl = new URL(META_OAUTH_URL);

  authorizationUrl.searchParams.set(
    "client_id",
    metaAppId,
  );

  authorizationUrl.searchParams.set(
    "redirect_uri",
    metaRedirectUri,
  );

  authorizationUrl.searchParams.set(
    "response_type",
    "code",
  );

  authorizationUrl.searchParams.set(
    "scope",
    META_PERMISSIONS.join(","),
  );

  authorizationUrl.searchParams.set(
    "state",
    state,
  );

  return redirect(authorizationUrl.toString(), {
    target: "_top",
  });
};

export default function InstagramConnectRoute() {
  return null;
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (
  headersArgs,
) => {
  return boundary.headers(headersArgs);
};