import { StoreAdapter, StoreListingResult } from "../types";
import { CATALOG } from "./mock-catalog";
import { tokenize } from "../normalize";

// Deterministic 0..1 pseudo-random from a string seed, so the same
// store+item always gets the same price instead of flickering between runs.
function seededUnit(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return ((h >>> 0) % 10000) / 10000;
}

export interface MockStoreConfig {
  key: string;
  name: string;
  baseUrl: string;
  logoUrl?: string;
  // Overall price positioning vs. the catalog's basePrice, e.g. 0.95 = usually cheaper.
  priceMultiplier: number;
  // +/- random jitter applied on top, e.g. 0.08 = up to 8% swing either way.
  jitter: number;
  // Simulated network latency so the UI has something realistic to show while loading.
  latencyMs?: number;
}

// Builds a fake but fully functional store integration: it "searches" the
// shared demo catalog by keyword and prices each hit deterministically per
// store, so different mock stores plausibly disagree on price for the same
// item -- exactly the signal a real price-comparison engine needs.
export function createMockStoreAdapter(config: MockStoreConfig): StoreAdapter {
  return {
    key: config.key,
    name: config.name,
    baseUrl: config.baseUrl,
    logoUrl: config.logoUrl,
    isLive: false,
    async search(query: string): Promise<StoreListingResult[]> {
      if (config.latencyMs) {
        await new Promise((r) => setTimeout(r, config.latencyMs));
      }
      const queryTokens = tokenize(query);
      if (queryTokens.length === 0) return [];

      const matches = CATALOG.filter((item) =>
        queryTokens.some((qt) =>
          item.keywords.some((kw) => kw.includes(qt) || qt.includes(kw))
        )
      );

      return matches.map((item) => {
        const seed = `${config.key}:${item.title}`;
        const swing = (seededUnit(seed) * 2 - 1) * config.jitter;
        const price = Math.round(item.basePrice * config.priceMultiplier * (1 + swing) * 100) / 100;
        const slug = encodeURIComponent(item.title.replace(/\s+/g, "-"));
        return {
          title: item.title,
          price,
          currency: "ILS",
          url: `${config.baseUrl}/product/${slug}`,
          imageUrl: item.imageUrl,
          inStock: seededUnit(seed + ":stock") > 0.08,
        };
      });
    },
  };
}
