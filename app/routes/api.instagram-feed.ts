import type {
  LoaderFunctionArgs,
} from "react-router";

import db from "../db.server";
import {
  getInstagramAccount,
  syncInstagramPosts,
} from "../models/instagram-feed.server";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Accept",
  "Cache-Control":
    "no-store, no-cache, must-revalidate",
  Pragma:
    "no-cache",
  Expires:
    "0",
};


function normalizeShop(
  shop: string,
): string {
  return shop
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
}


function isValidShopDomain(
  shop: string,
): boolean {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i
    .test(shop);
}


export const loader = async ({
  request,
}: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(
      null,
      {
        status: 204,
        headers: corsHeaders,
      },
    );
  }

  const url =
    new URL(request.url);

  const rawShop =
    url.searchParams.get("shop");

  if (!rawShop) {
    return Response.json(
      {
        error:
          "Missing shop parameter.",
        posts: [],
      },
      {
        status: 400,
        headers: corsHeaders,
      },
    );
  }

  const shop =
    normalizeShop(rawShop);

  if (!isValidShopDomain(shop)) {
    return Response.json(
      {
        error:
          "Invalid shop parameter.",
        posts: [],
      },
      {
        status: 400,
        headers: corsHeaders,
      },
    );
  }

  try {
    const account =
      await getInstagramAccount(shop);

    if (
      account?.lastSyncedAt &&
      Date.now() -
        account.lastSyncedAt.getTime() >
        6 * 60 * 60 * 1000
    ) {
      syncInstagramPosts(shop).catch(
        (error) => {
          console.error(
            "Automatic Instagram resync failed:",
            error,
          );
        },
      );
    }

    const posts =
      await db.instagramPost.findMany({
        where: {
          shop,
          isPublished: true,
        },
        include: {
          tags: true,
        },
        orderBy: [
          {
            timestamp: "desc",
          },
          {
            createdAt: "desc",
          },
        ],
      });

    console.log(
      "PUBLIC INSTAGRAM FEED:",
      {
        shop,
        postCount:
          posts.length,
      },
    );

    return Response.json(
      {
        posts:
          posts.map(
            (post) => ({
              id:
                post.id,
              mediaUrl:
                post.mediaUrl,
              thumbnailUrl:
                post.thumbnailUrl,
              mediaType:
                post.mediaType,
              caption:
                post.caption,
              permalink:
                post.permalink,
              timestamp:
                post.timestamp,
              tags:
                post.tags.map(
                  (tag) => ({
                    id:
                      tag.id,
                    productId:
                      tag.productId,
                    variantId:
                      tag.variantId,
                    productHandle:
                      tag.productHandle,
                    productTitle:
                      tag.productTitle,
                    collectionId:
                      tag.collectionId,
                    collectionHandle:
                      tag.collectionHandle,
                    collectionTitle:
                      tag.collectionTitle,
                    xPosition:
                      tag.xPosition,
                    yPosition:
                      tag.yPosition,
                  }),
                ),
            }),
          ),
      },
      {
        status: 200,
        headers: corsHeaders,
      },
    );
  } catch (error) {
    console.error(
      "Could not load public Instagram feed:",
      error,
    );

    return Response.json(
      {
        error:
          "Instagram feed is temporarily unavailable.",
        posts: [],
      },
      {
        status: 500,
        headers: corsHeaders,
      },
    );
  }
};