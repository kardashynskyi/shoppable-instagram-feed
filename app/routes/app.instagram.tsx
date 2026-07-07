import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  createInstagramPost,
  deleteInstagramPost,
  deleteInstagramPostTag,
  getInstagramAccount,
  getInstagramPosts,
  tagInstagramPost,
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

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const intent = String(formData.get("intent") || "");

  if (intent === "delete-post") {
    const postId = String(formData.get("postId") || "").trim();

    if (!postId) {
      return {
        success: false,
        message: null,
        error: "Post ID is required.",
      };
    }

    const result = await deleteInstagramPost(postId, session.shop);

    if (result.count === 0) {
      return {
        success: false,
        message: null,
        error: "Post not found.",
      };
    }

    return {
      success: true,
      message: "Post deleted successfully.",
      error: null,
    };
  }

  if (intent === "create-tag") {
    const postId = String(formData.get("postId") || "").trim();

    const productId = String(
      formData.get("productId") || "",
    ).trim();

    const productHandle = String(
      formData.get("productHandle") || "",
    ).trim();

    const productTitle = String(
      formData.get("productTitle") || "",
    ).trim();

    const collectionId = String(
      formData.get("collectionId") || "",
    ).trim();

    const collectionHandle = String(
      formData.get("collectionHandle") || "",
    ).trim();

    const collectionTitle = String(
      formData.get("collectionTitle") || "",
    ).trim();

    if (!postId) {
      return {
        success: false,
        message: null,
        error: "Post ID is required.",
      };
    }

    const hasProduct =
      productId || productHandle || productTitle;

    const hasCollection =
      collectionId || collectionHandle || collectionTitle;

    if (!hasProduct && !hasCollection) {
      return {
        success: false,
        message: null,
        error:
          "Enter at least one product or collection field.",
      };
    }

    await tagInstagramPost({
      shop: session.shop,
      postId,
      productId: productId || undefined,
      productHandle: productHandle || undefined,
      productTitle: productTitle || undefined,
      collectionId: collectionId || undefined,
      collectionHandle: collectionHandle || undefined,
      collectionTitle: collectionTitle || undefined,
    });

    return {
      success: true,
      message: "Tag added successfully.",
      error: null,
    };
  }

  if (intent === "delete-tag") {
    const tagId = String(formData.get("tagId") || "").trim();

    if (!tagId) {
      return {
        success: false,
        message: null,
        error: "Tag ID is required.",
      };
    }

    const result = await deleteInstagramPostTag(
      tagId,
      session.shop,
    );

    if (result.count === 0) {
      return {
        success: false,
        message: null,
        error: "Tag not found.",
      };
    }

    return {
      success: true,
      message: "Tag removed successfully.",
      error: null,
    };
  }

  if (intent !== "create-post") {
    return {
      success: false,
      message: null,
      error: "Invalid form action.",
    };
  }

  const mediaUrl = String(
    formData.get("mediaUrl") || "",
  ).trim();

  const caption = String(
    formData.get("caption") || "",
  ).trim();

  const mediaType = String(
    formData.get("mediaType") || "IMAGE",
  ).trim();

  if (!mediaUrl) {
    return {
      success: false,
      message: null,
      error: "Media URL is required.",
    };
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(mediaUrl);
  } catch {
    return {
      success: false,
      message: null,
      error: "Enter a valid media URL.",
    };
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return {
      success: false,
      message: null,
      error: "Media URL must use http or https.",
    };
  }

  const hostname = parsedUrl.hostname.toLowerCase();

  if (
    hostname === "instagram.com" ||
    hostname === "www.instagram.com" ||
    hostname.endsWith(".instagram.com")
  ) {
    return {
      success: false,
      message: null,
      error:
        "Instagram page URLs are not direct media files. Enter a direct image or video URL.",
    };
  }

  const allowedMediaTypes = [
    "IMAGE",
    "VIDEO",
    "CAROUSEL_ALBUM",
    "STORY",
  ];

  if (!allowedMediaTypes.includes(mediaType)) {
    return {
      success: false,
      message: null,
      error: "Invalid media type.",
    };
  }

  await createInstagramPost({
    shop: session.shop,
    mediaUrl,
    caption: caption || undefined,
    mediaType,
    timestamp: new Date(),
  });

  return {
    success: true,
    message: "Manual post added successfully.",
    error: null,
  };
};

export default function InstagramPage() {
  const { account, posts, stats } =
    useLoaderData<typeof loader>();

  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();

  const isCreatingPost =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "create-post";

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
                {stats.totalPosts === 1 ? "post" : "posts"}{" "}
                currently synced.
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
                {stats.shoppablePosts === 1
                  ? "post has"
                  : "posts have"}{" "}
                products or collections tagged.
              </s-paragraph>
            </s-stack>
          </s-box>
        </s-stack>
      </s-section>

      <s-section heading="Add manual post">
        <Form method="post">
          <input
            type="hidden"
            name="intent"
            value="create-post"
          />

          <s-stack direction="block" gap="base">
            <label>
              <strong>Media URL</strong>

              <input
                type="url"
                name="mediaUrl"
                placeholder="https://example.com/image.jpg"
                required
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: "8px",
                  padding: "10px",
                  border: "1px solid #8c9196",
                  borderRadius: "8px",
                }}
              />
            </label>

            <label>
              <strong>Caption</strong>

              <textarea
                name="caption"
                placeholder="Enter an Instagram caption"
                rows={4}
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: "8px",
                  padding: "10px",
                  border: "1px solid #8c9196",
                  borderRadius: "8px",
                  resize: "vertical",
                }}
              />
            </label>

            <label>
              <strong>Media type</strong>

              <select
                name="mediaType"
                defaultValue="IMAGE"
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: "8px",
                  padding: "10px",
                  border: "1px solid #8c9196",
                  borderRadius: "8px",
                }}
              >
                <option value="IMAGE">Image</option>
                <option value="VIDEO">Video</option>
                <option value="CAROUSEL_ALBUM">
                  Carousel
                </option>
                <option value="STORY">Story</option>
              </select>
            </label>

            {actionData?.error ? (
              <s-paragraph>
                {actionData.error}
              </s-paragraph>
            ) : null}

            {actionData?.message ? (
              <s-paragraph>
                {actionData.message}
              </s-paragraph>
            ) : null}

            <button
              type="submit"
              disabled={isCreatingPost}
              style={{
                width: "fit-content",
                padding: "10px 16px",
                border: 0,
                borderRadius: "8px",
                cursor: isCreatingPost
                  ? "not-allowed"
                  : "pointer",
                fontWeight: 600,
              }}
            >
              {isCreatingPost
                ? "Adding post..."
                : "Add manual post"}
            </button>
          </s-stack>
        </Form>
      </s-section>

      <s-section heading="Instagram posts">
        {posts.length === 0 ? (
          <s-stack direction="block" gap="base">
            <s-heading>No posts yet</s-heading>

            <s-paragraph>
              Instagram posts will appear here after they are
              added or synced. You will then be able to tag
              Shopify products and collections to each post.
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
                <s-stack direction="block" gap="base">
                  {post.mediaType === "IMAGE" ? (
                    <img
                      src={post.mediaUrl}
                      alt={
                        post.caption || "Instagram post"
                      }
                      style={{
                        width: "100%",
                        maxWidth: "320px",
                        height: "auto",
                        borderRadius: "8px",
                        display: "block",
                      }}
                    />
                  ) : null}

                  <s-heading>
                    {post.caption || "Instagram post"}
                  </s-heading>

                  <s-paragraph>
                    Media type: {post.mediaType}
                  </s-paragraph>

                  <s-paragraph>
                    {post.tags.length}{" "}
                    {post.tags.length === 1
                      ? "tag"
                      : "tags"}
                  </s-paragraph>

                  {post.tags.length > 0 ? (
                    <s-stack direction="block" gap="small">
                      <s-heading>Current tags</s-heading>

                      {post.tags.map((tag) => (
                        <s-box
                          key={tag.id}
                          padding="base"
                          borderWidth="base"
                          borderRadius="base"
                          background="subdued"
                        >
                          <s-stack
                            direction="block"
                            gap="small"
                          >
                            {tag.productTitle ? (
                              <s-paragraph>
                                Product: {tag.productTitle}
                              </s-paragraph>
                            ) : null}

                            {tag.productHandle ? (
                              <s-paragraph>
                                Product handle:{" "}
                                {tag.productHandle}
                              </s-paragraph>
                            ) : null}

                            {tag.productId ? (
                              <s-paragraph>
                                Product ID: {tag.productId}
                              </s-paragraph>
                            ) : null}

                            {tag.collectionTitle ? (
                              <s-paragraph>
                                Collection:{" "}
                                {tag.collectionTitle}
                              </s-paragraph>
                            ) : null}

                            {tag.collectionHandle ? (
                              <s-paragraph>
                                Collection handle:{" "}
                                {tag.collectionHandle}
                              </s-paragraph>
                            ) : null}

                            {tag.collectionId ? (
                              <s-paragraph>
                                Collection ID:{" "}
                                {tag.collectionId}
                              </s-paragraph>
                            ) : null}

                            <Form method="post">
                              <input
                                type="hidden"
                                name="intent"
                                value="delete-tag"
                              />

                              <input
                                type="hidden"
                                name="tagId"
                                value={tag.id}
                              />

                              <button
                                type="submit"
                                style={{
                                  width: "fit-content",
                                  padding: "8px 12px",
                                  border:
                                    "1px solid #8c9196",
                                  borderRadius: "8px",
                                  cursor: "pointer",
                                  fontWeight: 600,
                                }}
                              >
                                Remove tag
                              </button>
                            </Form>
                          </s-stack>
                        </s-box>
                      ))}
                    </s-stack>
                  ) : null}

                  <s-box
                    padding="base"
                    borderWidth="base"
                    borderRadius="base"
                    background="subdued"
                  >
                    <Form method="post">
                      <input
                        type="hidden"
                        name="intent"
                        value="create-tag"
                      />

                      <input
                        type="hidden"
                        name="postId"
                        value={post.id}
                      />

                      <s-stack
                        direction="block"
                        gap="base"
                      >
                        <s-heading>
                          Tag product or collection
                        </s-heading>

                        <label>
                          <strong>Product ID</strong>

                          <input
                            type="text"
                            name="productId"
                            placeholder="gid://shopify/Product/..."
                            style={{
                              display: "block",
                              width: "100%",
                              marginTop: "8px",
                              padding: "10px",
                              border:
                                "1px solid #8c9196",
                              borderRadius: "8px",
                            }}
                          />
                        </label>

                        <label>
                          <strong>Product handle</strong>

                          <input
                            type="text"
                            name="productHandle"
                            placeholder="wool-socks"
                            style={{
                              display: "block",
                              width: "100%",
                              marginTop: "8px",
                              padding: "10px",
                              border:
                                "1px solid #8c9196",
                              borderRadius: "8px",
                            }}
                          />
                        </label>

                        <label>
                          <strong>Product title</strong>

                          <input
                            type="text"
                            name="productTitle"
                            placeholder="Carpathian Wool Socks"
                            style={{
                              display: "block",
                              width: "100%",
                              marginTop: "8px",
                              padding: "10px",
                              border:
                                "1px solid #8c9196",
                              borderRadius: "8px",
                            }}
                          />
                        </label>

                        <label>
                          <strong>Collection ID</strong>

                          <input
                            type="text"
                            name="collectionId"
                            placeholder="gid://shopify/Collection/..."
                            style={{
                              display: "block",
                              width: "100%",
                              marginTop: "8px",
                              padding: "10px",
                              border:
                                "1px solid #8c9196",
                              borderRadius: "8px",
                            }}
                          />
                        </label>

                        <label>
                          <strong>
                            Collection handle
                          </strong>

                          <input
                            type="text"
                            name="collectionHandle"
                            placeholder="winter-collection"
                            style={{
                              display: "block",
                              width: "100%",
                              marginTop: "8px",
                              padding: "10px",
                              border:
                                "1px solid #8c9196",
                              borderRadius: "8px",
                            }}
                          />
                        </label>

                        <label>
                          <strong>
                            Collection title
                          </strong>

                          <input
                            type="text"
                            name="collectionTitle"
                            placeholder="Winter Collection"
                            style={{
                              display: "block",
                              width: "100%",
                              marginTop: "8px",
                              padding: "10px",
                              border:
                                "1px solid #8c9196",
                              borderRadius: "8px",
                            }}
                          />
                        </label>

                        <button
                          type="submit"
                          style={{
                            width: "fit-content",
                            padding: "10px 16px",
                            border: 0,
                            borderRadius: "8px",
                            cursor: "pointer",
                            fontWeight: 600,
                          }}
                        >
                          Add tag
                        </button>
                      </s-stack>
                    </Form>
                  </s-box>

                  <s-paragraph>
                    Media URL: {post.mediaUrl}
                  </s-paragraph>

                  <Form method="post">
                    <input
                      type="hidden"
                      name="intent"
                      value="delete-post"
                    />

                    <input
                      type="hidden"
                      name="postId"
                      value={post.id}
                    />

                    <button
                      type="submit"
                      style={{
                        width: "fit-content",
                        padding: "8px 12px",
                        border: "1px solid #8c9196",
                        borderRadius: "8px",
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      Delete post
                    </button>
                  </Form>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        )}
      </s-section>

      <s-section slot="aside" heading="Next step">
        <s-paragraph>
          After manual tagging works, replace these text fields
          with Shopify product and collection resource pickers.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};