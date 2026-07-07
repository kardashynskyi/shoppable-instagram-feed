import type { LoaderFunctionArgs } from "react-router";
import db from "../db.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return Response.json(
      { error: "Missing shop parameter." },
      { status: 400, headers: corsHeaders },
    );
  }

  const posts = await db.instagramPost.findMany({
    where: {
      shop,
      isPublished: true,
    },
    include: {
      tags: true,
    },
    orderBy: {
      timestamp: "desc",
    },
  });

  return Response.json(
    {
      posts: posts.map((post) => ({
        id: post.id,
        mediaUrl: post.mediaUrl,
        mediaType: post.mediaType,
        caption: post.caption,
        permalink: post.permalink,
        tags: post.tags.map((tag) => ({
          id: tag.id,
          productId: tag.productId,
          productHandle: tag.productHandle,
          productTitle: tag.productTitle,
          collectionId: tag.collectionId,
          collectionHandle: tag.collectionHandle,
          collectionTitle: tag.collectionTitle,
        })),
      })),
    },
    { headers: corsHeaders },
  );
};