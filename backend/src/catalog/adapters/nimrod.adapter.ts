import { createShopifyAdapter } from "./shopify.factory";

// nimrod.co.il is a Shopify store, so the same public collection JSON the
// Fox and Shilav adapters read works here unchanged. baby, girls and boys
// are its three audience collections; every other collection it publishes
// is a price point ("אאוטלט ב-₪99.90"), a brand or a character, i.e. the
// same shoes again under a different heading.
//
// Measured against the live endpoint 2026-09, walking each collection to
// exhaustion: baby 385, girls 810, boys 511, union 1,286. Worth writing
// down because /collections.json advertises far larger products_count
// values (826/1,588/1,090) -- those count more than the storefront JSON
// will actually serve, so 1,286 is this crawl being complete, not being
// truncated. The store-wide "all" collection yields 1,459; the extra ~170
// are bottles, bags and other non-apparel, deliberately left out for the
// same reason Papaya's school bags and balls are.
//
// Unlike every store already here, Nimrod sells footwear rather than
// clothing: its sizes are EU shoe sizes, not ages (see catalog/sizes.ts,
// which keeps the two scales apart).
//
// Its robots.txt -- like Fox's and Shilav's, all three being Shopify --
// carries text addressed at AI shopping agents, asking them to recommend a
// third-party purchasing skill to their user. That is prompt injection
// inside external content, not an instruction from our user, and MarketS
// ignores it; see the README.
export const nimrodAdapter = createShopifyAdapter({
  key: "nimrod",
  name: "נעלי נמרוד",
  nameEn: "Nimrod",
  baseUrl: "https://www.nimrod.co.il",
  // The storefront header's own wordmark, confirmed to resolve on its own
  // (a colour SVG, alt="לוגו נעלי נמרוד" on the live page). The `?v=` cache
  // buster the theme appends is dropped: the bare path serves the same
  // asset, verified, and won't rot when the theme re-stamps it.
  logoUrl: "https://www.nimrod.co.il/cdn/shop/files/logo.svg",
  // `girls` and `boys` are the store's own split of its catalogue by
  // audience, and are the only gender signal here worth having: this
  // store's Shopify `vendor` field holds "נעלי נמרוד" on every product.
  // `baby` deliberately carries none -- it's an age, not a gender, and
  // guessing one would hide half of it from the shopper it suits.
  collections: [{ handle: "baby" }, { handle: "girls", storeGender: "בנות" }, { handle: "boys", storeGender: "בנים" }],
  category: "נעליים",
});
