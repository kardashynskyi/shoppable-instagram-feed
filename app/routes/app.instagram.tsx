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
  useSubmit,
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
  syncInstagramPosts,
} from "../models/instagram-feed.server";

type ShopifyPickedVariant = {
  id: string;
  title?: string;
};

type ShopifyPickedResource = {
  id: string;
  title?: string;
  handle?: string;
  variants?: ShopifyPickedVariant[];
};

declare global {
  interface Window {
    shopify?: {
      resourcePicker: (
        options:
          | {
              type: "product";
              action?: "select" | "add";
              multiple?: boolean | number;
              filter?: {
                variants?: boolean;
                hidden?: boolean;
                draft?: boolean;
                archived?: boolean;
              };
            }
          | {
              type: "collection";
              action?: "select" | "add";
              multiple?: boolean | number;
            },
      ) => Promise<ShopifyPickedResource[] | undefined>;
    };
  }
}

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

  if (intent === "sync-instagram") {
  try {
    const result = await syncInstagramPosts(session.shop);

    return {
      success: true,
      message: `Synced ${result.syncedCount} Instagram posts.`,
      error: null,
    };
  } catch (error) {
    return {
      success: false,
      message: null,
      error:
        error instanceof Error
          ? error.message
          : "Instagram sync failed.",
    };
  }
}

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

    const productId = String(formData.get("productId") || "").trim();
   const variantId = String(
  formData.get("variantId") || "",
).trim();
    const productHandle = String(formData.get("productHandle") || "").trim();
    const productTitle = String(formData.get("productTitle") || "").trim();

    const collectionId = String(formData.get("collectionId") || "").trim();
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

    const hasProduct = productId || variantId || productHandle || productTitle;
    const hasCollection =
      collectionId || collectionHandle || collectionTitle;

    if (!hasProduct && !hasCollection) {
      return {
        success: false,
        message: null,
        error: "Select or enter at least one product or collection.",
      };
    }

    await tagInstagramPost({
      shop: session.shop,
      postId,
      productId: productId || undefined,
      variantId: variantId || undefined,
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

    const result = await deleteInstagramPostTag(tagId, session.shop);

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

  const mediaUrl = String(formData.get("mediaUrl") || "").trim();
  const caption = String(formData.get("caption") || "").trim();
  const mediaType = String(formData.get("mediaType") || "IMAGE").trim();

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

  const allowedMediaTypes = ["IMAGE", "VIDEO", "CAROUSEL_ALBUM", "STORY"];

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
  const { account, posts, stats } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();

  const fieldStyle = {
    display: "block",
    width: "100%",
    boxSizing: "border-box" as const,
    marginTop: "8px",
    padding: "10px 12px",
    border: "1px solid #8c9196",
    borderRadius: "8px",
    background: "#ffffff",
  };

  const isSyncing =
  navigation.state === "submitting" &&
  navigation.formData?.get("intent") === "sync-instagram";

  const handlePickProduct = async (postId: string) => {
    if (!window.shopify?.resourcePicker) {
      alert("Shopify product picker is not available.");
      return;
    }

    const selected = await window.shopify.resourcePicker({
      type: "product",
      action: "select",
      multiple: false,
      filter: {
        variants: true,
      },
    });

    const product = selected?.[0];

    if (!product) {
      return;
    }

    const variantId = product.variants?.[0]?.id || "";

    const formData = new FormData();

    formData.append("intent", "create-tag");
    formData.append("postId", postId);
    formData.append("productId", product.id);
    formData.append("variantId", variantId);
    formData.append("productTitle", product.title || "");
    formData.append("productHandle", product.handle || "");

    submit(formData, {
      method: "post",
    });
  };

  const handlePickCollection = async (postId: string) => {
    if (!window.shopify?.resourcePicker) {
      alert("Shopify collection picker is not available.");
      return;
    }

    const selected = await window.shopify.resourcePicker({
      type: "collection",
      action: "select",
      multiple: false,
    });

    const collection = selected?.[0];

    if (!collection) {
      return;
    }

    const formData = new FormData();

    formData.append("intent", "create-tag");
    formData.append("postId", postId);
    formData.append("collectionId", collection.id);
    formData.append("collectionTitle", collection.title || "");
    formData.append("collectionHandle", collection.handle || "");

    submit(formData, {
      method: "post",
    });
  };

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

      <s-section heading="Instagram Sync">
  <Form method="post">
    <input
      type="hidden"
      name="intent"
      value="sync-instagram"
    />

    <button
  type="submit"
  disabled={isSyncing}
  style={{
    width: "fit-content",
    padding: "10px 16px",
    borderRadius: "8px",
    cursor: isSyncing ? "not-allowed" : "pointer",
    fontWeight: 600,
  }}
>
  {isSyncing ? "Syncing Instagram..." : "Sync Instagram Posts"}
</button>
  </Form>

  {actionData?.message && (
    <s-paragraph>{actionData.message}</s-paragraph>
  )}

  {actionData?.error && (
    <s-paragraph>{actionData.error}</s-paragraph>
  )}
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
                <s-stack direction="block" gap="base">
                  {post.mediaType === "IMAGE" ? (
                    <img
                      src={post.mediaUrl}
                      alt={post.caption || "Instagram post"}
                      style={{
                        width: "100%",
                        maxWidth: "320px",
                        height: "auto",
                        borderRadius: "8px",
                        display: "block",
                      }}
                    />
                  ) : null}

                  <s-heading>{post.caption || "Instagram post"}</s-heading>

                  <s-paragraph>Media type: {post.mediaType}</s-paragraph>

                  <s-paragraph>
                    {post.tags.length}{" "}
                    {post.tags.length === 1 ? "tag" : "tags"}
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
                          <s-stack direction="block" gap="small">
                            {tag.productTitle ? (
                              <s-paragraph>
                                Product: {tag.productTitle}
                              </s-paragraph>
                            ) : null}

                            {tag.productHandle ? (
                              <s-paragraph>
                                Product handle: {tag.productHandle}
                              </s-paragraph>
                            ) : null}

                            {tag.productId ? (
                              <s-paragraph>Product ID: {tag.productId}</s-paragraph>
                            ) : null}

                            {tag.collectionTitle ? (
                              <s-paragraph>
                                Collection: {tag.collectionTitle}
                              </s-paragraph>
                            ) : null}

                            {tag.collectionHandle ? (
                              <s-paragraph>
                                Collection handle: {tag.collectionHandle}
                              </s-paragraph>
                            ) : null}

                            {tag.collectionId ? (
                              <s-paragraph>
                                Collection ID: {tag.collectionId}
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
                                  border: "1px solid #8c9196",
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

                  <s-stack direction="inline" gap="base">
                    <button
                      type="button"
                      onClick={() => handlePickProduct(post.id)}
                      style={{
                        width: "fit-content",
                        padding: "10px 16px",
                        border: 0,
                        borderRadius: "8px",
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      Select product from Shopify
                    </button>

                    <button
                      type="button"
                      onClick={() => handlePickCollection(post.id)}
                      style={{
                        width: "fit-content",
                        padding: "10px 16px",
                        border: 0,
                        borderRadius: "8px",
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      Select collection from Shopify
                    </button>
                  </s-stack>

                  <s-box
                    padding="base"
                    borderWidth="base"
                    borderRadius="base"
                    background="subdued"
                  >
                    <Form method="post">
                      <input type="hidden" name="intent" value="create-tag" />
                      <input type="hidden" name="postId" value={post.id} />

                      <s-stack direction="block" gap="base">
                        <s-heading>Manual tag fallback</s-heading>

                        <label>
  <strong>Product ID</strong>

  <input
    type="text"
    name="productId"
    placeholder="gid://shopify/Product/..."
    style={fieldStyle}
  />
</label>

<label>
  <strong>Variant ID</strong>

  <input
    type="text"
    name="variantId"
    placeholder="gid://shopify/ProductVariant/..."
    style={fieldStyle}
  />
</label>

<label>
  <strong>Product handle</strong>

                          <input
                            type="text"
                            name="productHandle"
                            placeholder="wool-socks"
                            style={fieldStyle}
                          />
                        </label>

                        <label>
                          <strong>Product title</strong>

                          <input
                            type="text"
                            name="productTitle"
                            placeholder="Carpathian Wool Socks"
                            style={fieldStyle}
                          />
                        </label>

                        <label>
                          <strong>Collection ID</strong>

                          <input
                            type="text"
                            name="collectionId"
                            placeholder="gid://shopify/Collection/..."
                            style={fieldStyle}
                          />
                        </label>

                        <label>
                          <strong>Collection handle</strong>

                          <input
                            type="text"
                            name="collectionHandle"
                            placeholder="winter-collection"
                            style={fieldStyle}
                          />
                        </label>

                        <label>
                          <strong>Collection title</strong>

                          <input
                            type="text"
                            name="collectionTitle"
                            placeholder="Winter Collection"
                            style={fieldStyle}
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
                          Add manual tag
                        </button>
                      </s-stack>
                    </Form>
                  </s-box>

                  <s-paragraph>Media URL: {post.mediaUrl}</s-paragraph>

                  <Form method="post">
                    <input type="hidden" name="intent" value="delete-post" />
                    <input type="hidden" name="postId" value={post.id} />

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
          After product and collection picking works, build the storefront feed
          with product links and add-to-cart actions.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};