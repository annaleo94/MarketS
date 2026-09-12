import { createShopifyAdapter } from "./shopify.factory";

// shilav.co.il is a Shopify store. Verified 2026-09: /collections/fashion-clothing
// ("ביגוד תינוקות וילדים") is their master baby/kids clothing category.
export const shilavAdapter = createShopifyAdapter({
  key: "shilav",
  name: "שילב",
  nameEn: "Shilav",
  baseUrl: "https://www.shilav.co.il",
  // /favicon.ico 404s (verified live). The real brand mark is the PNG
  // logo the storefront's own header renders -- the "שילב · BORN TO LOVE"
  // badge, not a generic icon.
  logoUrl: "https://www.shilav.co.il/cdn/shop/files/SHILAV-1.png?v=1724591056&width=200",
  collections: [{ handle: "fashion-clothing" }],
  category: "בגדי תינוקות וילדים",
});
