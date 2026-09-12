import { createShopifyAdapter } from "./shopify.factory";

// fox.co.il is a Shopify store. Verified 2026-09: /collections/baby and
// /collections/kids together cover the baby & children's clothing pilot
// scope (confirmed via /collections.json -- the store also sells adult
// clothing, which these two collections exclude).
export const foxAdapter = createShopifyAdapter({
  key: "fox",
  name: "פוקס",
  nameEn: "FOX",
  baseUrl: "https://fox.co.il",
  // /favicon.ico 404s (verified live -- this store doesn't serve one at
  // the root). The real brand wordmark is the SVG the storefront's own
  // header uses, pulled straight off the live page and confirmed to
  // resolve on its own (a red "FOX" logotype, not a generic icon).
  logoUrl:
    "https://fox.co.il/cdn/shop/files/66f09c4a7a05e4ac1fcc302c485d4eb1_5ff8c165-c1c2-4740-9594-fb05002bc536.svg",
  collections: [{ handle: "baby" }, { handle: "kids" }],
  category: "בגדי תינוקות וילדים",
});
