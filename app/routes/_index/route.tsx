import type {
  LoaderFunctionArgs,
} from "react-router";

import {
  redirect,
} from "react-router";

export const loader = async ({
  request,
}: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  const params = new URLSearchParams();

  const shop = url.searchParams.get("shop");
  const host = url.searchParams.get("host");
  const embedded = url.searchParams.get("embedded");

  if (shop) {
    params.set("shop", shop);
  }

  if (host) {
    params.set("host", host);
  }

  if (embedded) {
    params.set("embedded", embedded);
  }

  return redirect(
    `/app?${params.toString()}`,
  );
};

export default function Index() {
  return null;
}