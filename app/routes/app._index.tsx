import type {
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function Index() {
  return (
    <s-page heading="Shoppable Instagram Feed">
      <s-section heading="Turn Instagram content into a shoppable storefront">
        <s-paragraph>
          Connect your Instagram account, automatically sync posts, reels,
          videos, and carousel content, then tag Shopify products and
          collections directly to each post.
        </s-paragraph>

        <s-stack direction="inline" gap="base">
          <s-button variant="primary" href="/app/instagram">
            Set up Instagram feed
          </s-button>
        </s-stack>
      </s-section>

      <s-section heading="Feed status">
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
                No Instagram account connected yet.
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
                0 posts currently synced.
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
                0 posts currently have products or collections tagged.
              </s-paragraph>
            </s-stack>
          </s-box>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Planned features">
        <s-unordered-list>
          <s-list-item>Automatic Instagram post sync</s-list-item>
          <s-list-item>Product and collection tagging</s-list-item>
          <s-list-item>Shop now buttons</s-list-item>
          <s-list-item>Add to cart buttons</s-list-item>
          <s-list-item>Carousel posts</s-list-item>
          <s-list-item>Video autoplay</s-list-item>
          <s-list-item>Product prices and reviews</s-list-item>
          <s-list-item>SEO and AI discoverability</s-list-item>
          <s-list-item>Marketing email feed embeds</s-list-item>
        </s-unordered-list>
      </s-section>

      <s-section slot="aside" heading="Storefront">
        <s-paragraph>
          Your theme app extension is deployed. Once Instagram is connected,
          synced posts will be available to the storefront feed.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};