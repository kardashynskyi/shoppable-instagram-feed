import type {
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  getInstagramAccount,
  getInstagramPosts,
} from "../models/instagram-feed.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const [account, posts] = await Promise.all([
    getInstagramAccount(session.shop),
    getInstagramPosts(session.shop),
  ]);

  const shoppablePostCount = posts.filter(
    (post) => post.tags.length > 0,
  ).length;

  return {
    account: account
      ? {
          id: account.id,
          username: account.username,
          connected: account.connected,
        }
      : null,
    posts,
    stats: {
      totalPosts: posts.length,
      shoppablePosts: shoppablePostCount,
    },
  };
};

export default function InstagramPage() {
  const { account, posts, stats } =
    useLoaderData<typeof loader>();

  return (
    <s-page heading="Instagram feed">
      <s-section heading="Feed overview">
        <s-stack direction="block" gap="base">
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <s-stack direction="block" gap="small">
              <s-heading>Instagram account</s-heading>

              <s-paragraph>
                {account?.connected
                  ? account.username
                    ? `Connected as @${account.username}`
                    : "Instagram account connected."
                  : "No Instagram account connected yet."}
              </s-paragraph>
            </s-stack>
          </s-box>

          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <s-stack direction="block" gap="small">
              <s-heading>Synced posts</s-heading>

              <s-paragraph>
                {stats.totalPosts}{" "}
                {stats.totalPosts === 1 ? "post" : "posts"} currently synced.
              </s-paragraph>
            </s-stack>
          </s-box>

          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <s-stack direction="block" gap="small">
              <s-heading>Shoppable posts</s-heading>

              <s-paragraph>
                {stats.shoppablePosts}{" "}
                {stats.shoppablePosts === 1 ? "post has" : "posts have"}{" "}
                products or collections tagged.
              </s-paragraph>
            </s-stack>
          </s-box>
        </s-stack>
      </s-section>

      <s-section heading="Instagram posts">
        {posts.length === 0 ? (
          <s-stack direction="block" gap="base">
            <s-heading>No posts yet</s-heading>

            <s-paragraph>
              Instagram posts will appear here after they are added or synced.
              You will then be able to tag Shopify products and collections to
              each post.
            </s-paragraph>
          </s-stack>
        ) : (
          <s-stack direction="block" gap="base">
            {posts.map((post) => (
              <s-box
                key={post.id}
                padding="base"
                borderWidth="base"
                borderRadius="base"
              >
                <s-stack direction="block" gap="small">
                  <s-heading>
                    {post.caption || "Instagram post"}
                  </s-heading>

                  <s-paragraph>
                    Media type: {post.mediaType}
                  </s-paragraph>

                  <s-paragraph>
                    {post.tags.length}{" "}
                    {post.tags.length === 1 ? "tag" : "tags"}
                  </s-paragraph>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        )}
      </s-section>

      <s-section slot="aside" heading="Next step">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Add product and collection tagging before connecting automatic
            Instagram sync.
          </s-paragraph>

          <s-button variant="primary">
            Add Instagram post
          </s-button>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};