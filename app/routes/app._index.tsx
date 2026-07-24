import type {
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";

import {
  redirect,
} from "react-router";

import {
  authenticate,
} from "../shopify.server";

import {
  boundary,
} from "@shopify/shopify-app-react-router/server";


export const loader = async ({
  request,
}: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const url = new URL(request.url);

  const params = new URLSearchParams();

  const embedded = url.searchParams.get("embedded");
  const host = url.searchParams.get("host");
  const shop = url.searchParams.get("shop");

  if (embedded) {
    params.set("embedded", embedded);
  }

  if (host) {
    params.set("host", host);
  }

  if (shop) {
    params.set("shop", shop);
  }

  return redirect(
    `/app/instagram?${params.toString()}`
  );
};


export default function Index() {
  return null;
}


export const headers: HeadersFunction = (
  headersArgs,
) => {
  return boundary.headers(
    headersArgs,
  );
};