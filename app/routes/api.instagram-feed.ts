import type { LoaderFunctionArgs } from "react-router";
import { json } from "react-router";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return json(
      { error: "Missing shop parameter." },
      { status: 400 },
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

  return json({
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
  });
};