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

import { boundary } from "@shopify/shopify-app-react-router/server";

import {
  createInstagramPost,
  deleteInstagramPost,
  deleteInstagramPostTag,
  disconnectInstagramAccount,
  getInstagramAccount,
  getInstagramPosts,
  tagInstagramPost,
  syncInstagramPosts,
} from "../models/instagram-feed.server";

import { authenticate } from "../shopify.server";


const META_GRAPH_API_VERSION =
  process.env.META_GRAPH_API_VERSION || "v25.0";

const META_OAUTH_URL =
  `https://www.facebook.com/${META_GRAPH_API_VERSION}/dialog/oauth`;

const META_PERMISSIONS = [
  "pages_show_list",
  "pages_read_engagement",
  "instagram_basic",
];


function requireEnvironmentVariable(
  name: string,
): string {
  const value =
    process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `${name} is missing from the server environment.`,
    );
  }

  return value;
}


function buildMetaAuthorizationUrl({
  shop,
  host,
}: {
  shop: string;
  host: string;
}): string {
  const metaAppId =
    requireEnvironmentVariable(
      "META_APP_ID",
    );

  const metaRedirectUri =
    requireEnvironmentVariable(
      "META_REDIRECT_URI",
    );

  const state =
    Buffer.from(
      JSON.stringify({
        shop,
        host,
        createdAt: Date.now(),
      }),
      "utf8",
    ).toString("base64url");

  const authorizationUrl =
    new URL(META_OAUTH_URL);

  authorizationUrl.searchParams.set(
    "client_id",
    metaAppId,
  );

  authorizationUrl.searchParams.set(
    "redirect_uri",
    metaRedirectUri,
  );

  authorizationUrl.searchParams.set(
    "response_type",
    "code",
  );

  authorizationUrl.searchParams.set(
    "scope",
    META_PERMISSIONS.join(","),
  );

  authorizationUrl.searchParams.set(
    "state",
    state,
  );

  return authorizationUrl.toString();
}


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
      ) => Promise<
        ShopifyPickedResource[] | undefined
      >;
    };
  }
}


export const loader = async ({
  request,
}: LoaderFunctionArgs) => {
  const { session } =
    await authenticate.admin(request);


  const requestUrl =
    new URL(request.url);


  const host =
    requestUrl.searchParams.get(
      "host",
    ) || "";


  if (!host) {
    throw new Response(
      "The Shopify host parameter is missing.",
      {
        status: 400,
      },
    );
  }


  const connectInstagramUrl =
    buildMetaAuthorizationUrl({
      shop:
        session.shop,
      host,
    });


  const [
    account,
    posts,
  ] = await Promise.all([
    getInstagramAccount(session.shop),
    getInstagramPosts(session.shop),
  ]);


  const shoppablePostCount =
    posts.filter(
      (post) =>
        post.tags.length > 0,
    ).length;


  return {
    connectInstagramUrl,

    account: account
      ? {
          id: account.id,
          username:
            account.username,
          connected:
            account.connected,
          reconnectRequired:
            account.reconnectRequired,
          lastSyncedAt:
            account.lastSyncedAt,
          lastSyncError:
            account.lastSyncError,
        }
      : null,

    posts,

    stats: {
      totalPosts:
        posts.length,

      shoppablePosts:
        shoppablePostCount,
    },
  };
};


export const action = async ({
  request,
}: ActionFunctionArgs) => {
  const { session } =
    await authenticate.admin(request);


  const formData =
    await request.formData();


  const intent =
    String(
      formData.get("intent") || "",
    );


  if (
    intent ===
    "disconnect-instagram"
  ) {
    await disconnectInstagramAccount(
      session.shop,
    );

    return {
      success: true,
      message:
        "Instagram account disconnected. Previously synced posts remain saved.",
      error: null,
    };
  }


  if (
    intent ===
    "sync-instagram"
  ) {
    try {
      const result =
        await syncInstagramPosts(
          session.shop,
        );

      return {
        success: true,
        message:
          `Synced ${result.syncedCount} Instagram posts.`,
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


  if (
    intent ===
    "delete-post"
  ) {
    const postId =
      String(
        formData.get("postId") || "",
      ).trim();


    if (!postId) {
      return {
        success:false,
        message:null,
        error:"Post ID is required.",
      };
    }


    const result =
      await deleteInstagramPost(
        postId,
        session.shop,
      );


    if (result.count === 0) {
      return {
        success:false,
        message:null,
        error:"Post not found.",
      };
    }


    return {
      success:true,
      message:"Post deleted successfully.",
      error:null,
    };
  }


  if (
    intent ===
    "create-tag"
  ) {

    const postId =
      String(
        formData.get("postId") || "",
      ).trim();


    const productId =
      String(
        formData.get("productId") || "",
      ).trim();


    const variantId =
      String(
        formData.get("variantId") || "",
      ).trim();


    const productHandle =
      String(
        formData.get("productHandle") || "",
      ).trim();


    const productTitle =
      String(
        formData.get("productTitle") || "",
      ).trim();


    const collectionId =
      String(
        formData.get("collectionId") || "",
      ).trim();


    const collectionHandle =
      String(
        formData.get("collectionHandle") || "",
      ).trim();


    const collectionTitle =
      String(
        formData.get("collectionTitle") || "",
      ).trim();


    if (!postId) {
      return {
        success:false,
        message:null,
        error:"Post ID is required.",
      };
    }


    const hasProduct =
      productId ||
      variantId ||
      productHandle ||
      productTitle;


    const hasCollection =
      collectionId ||
      collectionHandle ||
      collectionTitle;


    if (
      !hasProduct &&
      !hasCollection
    ) {
      return {
        success:false,
        message:null,
        error:
          "Select or enter at least one product or collection.",
      };
    }


    await tagInstagramPost({
      shop:
        session.shop,

      postId,

      productId:
        productId || undefined,

      variantId:
        variantId || undefined,

      productHandle:
        productHandle || undefined,

      productTitle:
        productTitle || undefined,

      collectionId:
        collectionId || undefined,

      collectionHandle:
        collectionHandle || undefined,

      collectionTitle:
        collectionTitle || undefined,
    });


    return {
      success:true,
      message:"Tag added successfully.",
      error:null,
    };
  }
    if (
    intent ===
    "delete-tag"
  ) {
    const tagId =
      String(
        formData.get("tagId") || "",
      ).trim();


    if (!tagId) {
      return {
        success:false,
        message:null,
        error:"Tag ID is required.",
      };
    }


    const result =
      await deleteInstagramPostTag(
        tagId,
        session.shop,
      );


    if (result.count === 0) {
      return {
        success:false,
        message:null,
        error:"Tag not found.",
      };
    }


    return {
      success:true,
      message:"Tag removed successfully.",
      error:null,
    };
  }


  if (
    intent !==
    "create-post"
  ) {
    return {
      success:false,
      message:null,
      error:"Invalid form action.",
    };
  }


  const mediaUrl =
    String(
      formData.get("mediaUrl") || "",
    ).trim();


  const caption =
    String(
      formData.get("caption") || "",
    ).trim();


  const mediaType =
    String(
      formData.get("mediaType") || "IMAGE",
    ).trim();


  if (!mediaUrl) {
    return {
      success:false,
      message:null,
      error:"Media URL is required.",
    };
  }


  let parsedUrl: URL;


  try {
    parsedUrl =
      new URL(mediaUrl);

  } catch {
    return {
      success:false,
      message:null,
      error:"Enter a valid media URL.",
    };
  }


  if (
    ![
      "http:",
      "https:",
    ].includes(parsedUrl.protocol)
  ) {
    return {
      success:false,
      message:null,
      error:"Media URL must use http or https.",
    };
  }


  const hostname =
    parsedUrl.hostname.toLowerCase();


  if (
    hostname === "instagram.com" ||
    hostname === "www.instagram.com" ||
    hostname.endsWith(".instagram.com")
  ) {
    return {
      success:false,
      message:null,
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


  if (
    !allowedMediaTypes.includes(mediaType)
  ) {
    return {
      success:false,
      message:null,
      error:"Invalid media type.",
    };
  }


  await createInstagramPost({
    shop:
      session.shop,

    mediaUrl,

    caption:
      caption || undefined,

    mediaType,

    timestamp:
      new Date(),
  });


  return {
    success:true,
    message:
      "Manual post added successfully.",
    error:null,
  };
};


export default function InstagramPage() {

  const {
    connectInstagramUrl,
    account,
    posts,
    stats,
  } =
    useLoaderData<typeof loader>();


  const actionData =
    useActionData<typeof action>();


  const navigation =
    useNavigation();


  const submit =
    useSubmit();


  const isSubmitting =
    navigation.state === "submitting";


  const submittingIntent =
    navigation.formData?.get("intent");


  const isSyncing =
    isSubmitting &&
    submittingIntent ===
      "sync-instagram";


  const isDisconnecting =
    isSubmitting &&
    submittingIntent ===
      "disconnect-instagram";


  const hasConnectedAccount =
    Boolean(account?.connected) &&
    !account?.reconnectRequired;


  const needsReconnection =
    Boolean(account?.reconnectRequired);


  const fieldStyle = {
    display:"block",
    width:"100%",
    boxSizing:"border-box" as const,
    marginTop:"8px",
    padding:"10px 12px",
    border:"1px solid #8c9196",
    borderRadius:"8px",
    background:"#ffffff",
  };


  const primaryButtonStyle = {
    display:"inline-block",
    width:"fit-content",
    padding:"10px 16px",
    border:0,
    borderRadius:"8px",
    cursor:"pointer",
    fontWeight:600,
    textDecoration:"none",
  };


  const secondaryButtonStyle = {
    display:"inline-block",
    width:"fit-content",
    padding:"10px 16px",
    border:"1px solid #8c9196",
    borderRadius:"8px",
    cursor:"pointer",
    fontWeight:600,
    textDecoration:"none",
  };


  const handlePickProduct =
    async (
      postId:string,
    ) => {

      if (
        !window.shopify?.resourcePicker
      ) {
        alert(
          "Shopify product picker is not available.",
        );
        return;
      }


      const selected =
        await window.shopify.resourcePicker({
          type:"product",
          action:"select",
          multiple:false,
          filter:{
            variants:true,
          },
        });


      const product =
        selected?.[0];


      if (!product) {
        return;
      }


      const variantId =
        product.variants?.[0]?.id ||
        "";


      const formData =
        new FormData();


      formData.append(
        "intent",
        "create-tag",
      );


      formData.append(
        "postId",
        postId,
      );


      formData.append(
        "productId",
        product.id,
      );


      formData.append(
        "variantId",
        variantId,
      );


      formData.append(
        "productTitle",
        product.title || "",
      );


      formData.append(
        "productHandle",
        product.handle || "",
      );


      submit(
        formData,
        {
          method:"post",
        },
      );
    };


  const handlePickCollection =
    async (
      postId:string,
    ) => {

      if (
        !window.shopify?.resourcePicker
      ) {
        alert(
          "Shopify collection picker is not available.",
        );
        return;
      }


      const selected =
        await window.shopify.resourcePicker({
          type:"collection",
          action:"select",
          multiple:false,
        });


      const collection =
        selected?.[0];


      if (!collection) {
        return;
      }


      const formData =
        new FormData();


      formData.append(
        "intent",
        "create-tag",
      );


      formData.append(
        "postId",
        postId,
      );


      formData.append(
        "collectionId",
        collection.id,
      );


      formData.append(
        "collectionTitle",
        collection.title || "",
      );


      formData.append(
        "collectionHandle",
        collection.handle || "",
      );


      submit(
        formData,
        {
          method:"post",
        },
      );
    };
      return (
    <s-page heading="Instagram feed">

      <s-section heading="Feed overview">

        <s-stack
          direction="block"
          gap="base"
        >

          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <s-stack
              direction="block"
              gap="small"
            >
              <s-heading>
                Instagram account
              </s-heading>

              <s-paragraph>
                {hasConnectedAccount
                  ? account?.username
                    ? `Connected as @${account.username}`
                    : "Instagram account connected."
                  : needsReconnection
                    ? "Instagram authorization has expired."
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
            <s-stack
              direction="block"
              gap="small"
            >
              <s-heading>
                Synced posts
              </s-heading>

              <s-paragraph>
                {stats.totalPosts}{" "}
                {stats.totalPosts === 1
                  ? "post"
                  : "posts"}{" "}
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
            <s-stack
              direction="block"
              gap="small"
            >

              <s-heading>
                Shoppable posts
              </s-heading>

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


      <s-section heading="Instagram Sync">

        <s-stack
          direction="block"
          gap="base"
        >

          {!account ? (

            <>
              <s-paragraph>
                Connect your Instagram professional
                account before syncing posts.
              </s-paragraph>

              <a
                href={connectInstagramUrl}
                target="_top"
                style={primaryButtonStyle}
              >
                Connect Instagram
              </a>
            </>

          ) : needsReconnection ? (

            <>
              <s-paragraph>
                Your Instagram authorization is no
                longer active. Reconnect the account
                to continue syncing posts.
              </s-paragraph>

              {account.lastSyncError ? (
                <s-paragraph>
                  Last error:{" "}
                  {account.lastSyncError}
                </s-paragraph>
              ) : null}

              <a
                href={connectInstagramUrl}
                target="_top"
                style={primaryButtonStyle}
              >
                Reconnect Instagram
              </a>

            </>

          ) : hasConnectedAccount ? (

            <>
              <div
                style={{
                  display:"flex",
                  alignItems:"center",
                  gap:"12px",
                  flexWrap:"wrap",
                }}
              >
                <s-paragraph>
                  {account.username
                    ? `Connected as @${account.username}.`
                    : "Instagram account connected."}
                </s-paragraph>


                <Form
                  method="post"
                  onSubmit={(event) => {
                    const confirmed =
                      window.confirm(
                        "Disconnect Instagram? Previously synced posts will remain saved.",
                      );

                    if (!confirmed) {
                      event.preventDefault();
                    }
                  }}
                >
                  <input
                    type="hidden"
                    name="intent"
                    value="disconnect-instagram"
                  />

                  <button
                    type="submit"
                    disabled={isDisconnecting}
                    style={{
                      ...secondaryButtonStyle,
                      cursor:isDisconnecting
                        ? "not-allowed"
                        : "pointer",
                      opacity:isDisconnecting
                        ? 0.6
                        : 1,
                    }}
                  >
                    {isDisconnecting
                      ? "Disconnecting..."
                      : "Disconnect"}
                  </button>
                </Form>
              </div>


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
                    ...primaryButtonStyle,
                    cursor:isSyncing
                      ? "not-allowed"
                      : "pointer",
                    opacity:isSyncing
                      ? 0.6
                      : 1,
                  }}
                >
                  {isSyncing
                    ? "Syncing Instagram..."
                    : "Sync Instagram Posts"}
                </button>

              </Form>


              {account.lastSyncedAt ? (

                <s-paragraph>
                  Last synced:{" "}
                  {new Date(
                    account.lastSyncedAt,
                  ).toLocaleString()}
                </s-paragraph>

              ) : null}

            </>

          ) : (

            <>
              <s-paragraph>
                Instagram is currently disconnected.
              </s-paragraph>

              <a
                href={connectInstagramUrl}
                target="_top"
                style={primaryButtonStyle}
              >
                Connect Instagram
              </a>
            </>

          )}


          {actionData?.message ? (

            <s-box
              padding="base"
              borderWidth="base"
              borderRadius="base"
              background="subdued"
            >
              <s-paragraph>
                {actionData.message}
              </s-paragraph>
            </s-box>

          ) : null}


          {actionData?.error ? (

            <s-box
              padding="base"
              borderWidth="base"
              borderRadius="base"
            >
              <s-paragraph>
                {actionData.error}
              </s-paragraph>
            </s-box>

          ) : null}

        </s-stack>

      </s-section>


      <s-section heading="Instagram posts">

        {posts.length === 0 ? (

          <s-stack
            direction="block"
            gap="base"
          >

            <s-heading>
              No posts yet
            </s-heading>

            <s-paragraph>
              Instagram posts will appear here after
              they are added or synced. You will then
              be able to tag Shopify products and
              collections to each post.
            </s-paragraph>

          </s-stack>

        ) : (

          <s-stack
            direction="block"
            gap="base"
          >

            {posts.map((post) => (

              <s-box
                key={post.id}
                padding="base"
                borderWidth="base"
                borderRadius="base"
              >

                <s-stack
                  direction="block"
                  gap="base"
                >

                  {post.mediaType === "IMAGE" ? (

                    <img
                      src={post.mediaUrl}
                      alt={
                        post.caption ||
                        "Instagram post"
                      }
                      style={{
                        width:"100%",
                        maxWidth:"320px",
                        height:"auto",
                        borderRadius:"8px",
                        display:"block",
                      }}
                    />

                  ) : null}


                  {post.mediaType === "VIDEO" ? (

                    <video
                      controls
                      preload="metadata"
                      poster={
                        post.thumbnailUrl ||
                        undefined
                      }
                      style={{
                        width:"100%",
                        maxWidth:"320px",
                        height:"auto",
                        borderRadius:"8px",
                        display:"block",
                      }}
                    >
                      <source src={post.mediaUrl}/>
                    </video>

                  ) : null}


                  <s-heading>
                    {post.caption ||
                      "Instagram post"}
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


                  <s-stack
                    direction="inline"
                    gap="base"
                  >

                    <button
                      type="button"
                      onClick={() =>
                        handlePickProduct(post.id)
                      }
                      style={primaryButtonStyle}
                    >
                      Select product from Shopify
                    </button>


                    <button
                      type="button"
                      onClick={() =>
                        handlePickCollection(post.id)
                      }
                      style={primaryButtonStyle}
                    >
                      Select collection from Shopify
                    </button>

                  </s-stack>


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
                      style={secondaryButtonStyle}
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


      <s-section
        slot="aside"
        heading="Next step"
      >

        <s-paragraph>
          Connect Instagram, sync posts, and tag
          Shopify products or collections to make
          the storefront feed shoppable.
        </s-paragraph>

      </s-section>


    </s-page>
  );
}


export const headers: HeadersFunction = (
  headersArgs,
) => {
  return boundary.headers(
    headersArgs,
  );
};