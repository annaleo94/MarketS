import { createShopifyAdapter } from "./shopify.factory";

// fox.co.il is a Shopify store. Verified 2026-09: /collections/baby and
// /collections/kids together cover the baby & children's clothing pilot
// scope (confirmed via /collections.json -- the store also sells adult
// clothing, which these two collections exclude).
export const foxAdapter = createShopifyAdapter({
  key: "fox",
  name: "פוקס",
  baseUrl: "https://fox.co.il",
  logoUrl: "https://fox.co.il/favicon.ico",
  collectionHandles: ["baby", "kids"],
  category: "בגדי תינוקות וילדים",
});
