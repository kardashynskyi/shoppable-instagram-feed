import type {
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";

import {
  Outlet,
  useLoaderData,
  useRouteError,
} from "react-router";

import {
  boundary,
} from "@shopify/shopify-app-react-router/server";

import {
  AppProvider,
} from "@shopify/shopify-app-react-router/react";

import {
  authenticate,
} from "../shopify.server";


export const loader = async ({
  request,
}: LoaderFunctionArgs) => {
  const { session } =
    await authenticate.admin(request);

  console.log(
    "APP ROUTE SESSION SHOP:",
    session.shop,
  );

  return {
    apiKey:
      process.env.SHOPIFY_API_KEY || "",
    shop:
      session.shop,
  };
};


export default function App() {
  const {
    apiKey,
    shop,
  } = useLoaderData<typeof loader>();

  return (
    <AppProvider
      embedded
      apiKey={apiKey}
      shop={shop}
    >
      <s-app-nav>
        <s-link href="/app/instagram">
          Instagram Feed
        </s-link>
      </s-app-nav>

      <Outlet />
    </AppProvider>
  );
}


export function ErrorBoundary() {
  return boundary.error(useRouteError());
}


export const headers: HeadersFunction = (
  headersArgs,
) => {
  return boundary.headers(headersArgs);
};