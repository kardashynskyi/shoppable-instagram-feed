import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

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
  const { session } = await authenticate.admin(request);

  const metaAppId =
    requireEnvironmentVariable("META_APP_ID");

  const metaRedirectUri =
    requireEnvironmentVariable("META_REDIRECT_URI");

  /*
   * The state value lets the callback identify which Shopify
   * store initiated the Meta authorization request.
   *
   * We will replace this with a signed, expiring state value
   * when we create the callback route.
   */
  const state = Buffer.from(
    JSON.stringify({
      shop: session.shop,
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

  return redirect(authorizationUrl.toString());
};

export default function InstagramConnectRoute() {
  return null;
}