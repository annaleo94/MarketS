import { LiveSiteConfig } from "./site-config";

// Real-store configs go here. Empty by default -- see
// ./README.md for exactly how to onboard a store (find its search URL,
// check robots.txt/ToS, verify it emits JSON-LD or fill in CSS selectors,
// test against the live page). Nothing in this file was verified against a
// live site (outbound access while building MarketS hit bot-protection /
// 403s on the obvious candidates), so no store is wired in by default --
// shipping guessed selectors as "done" would just be broken code with
// false confidence. The template below shows the shape to fill in.
export const liveSiteConfigs: LiveSiteConfig[] = [
  // {
  //   key: "example-store",
  //   name: "Example Store",
  //   baseUrl: "https://www.example.co.il",
  //   logoUrl: "https://www.example.co.il/favicon.ico",
  //   buildSearchUrl: (query) =>
  //     `https://www.example.co.il/search?q=${encodeURIComponent(query)}`,
  //   // Only needed if the JSON-LD adapter (tried first) finds nothing on
  //   // this store's search page -- inspect the real DOM to fill these in.
  //   css: {
  //     item: ".product-card",
  //     title: ".product-card__title",
  //     price: ".product-card__price",
  //     link: "a.product-card__link",
  //     image: "img.product-card__image",
  //   },
  //   maxResults: 8,
  // },
];
