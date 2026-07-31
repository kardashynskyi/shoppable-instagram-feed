import type {
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";

import {
  useEffect,
} from "react";

import {
  useNavigate,
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

  return null;
};


export default function Index() {
  const navigate =
    useNavigate();

  useEffect(() => {
    navigate(
      "/app/instagram",
      {
        replace: true,
      },
    );
  }, [navigate]);

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