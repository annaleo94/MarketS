import { createShopifyAdapter } from "./shopify.factory";

// shilav.co.il is a Shopify store. Verified 2026-09: /collections/fashion-clothing
// ("ביגוד תינוקות וילדים") is their master baby/kids clothing category.
export const shilavAdapter = createShopifyAdapter({
  key: "shilav",
  name: "שילב",
  baseUrl: "https://www.shilav.co.il",
  logoUrl: "https://www.shilav.co.il/favicon.ico",
  collectionHandles: ["fashion-clothing"],
  category: "בגדי תינוקות וילדים",
});
