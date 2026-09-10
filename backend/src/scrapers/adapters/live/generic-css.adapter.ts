import * as cheerio from "cheerio";
import { StoreAdapter, StoreListingResult } from "../../types";
import { relevanceScore } from "../../normalize";
import { LiveSiteConfig } from "./site-config";
import { fetchHtml } from "./http";
import { parsePrice } from "./price-parse";

const RELEVANCE_THRESHOLD = 0.4;
const DEFAULT_MAX_RESULTS = 8;

// CSS-selector-driven scraper for stores that don't expose schema.org
// JSON-LD (see generic-jsonld.adapter.ts, which should be tried first --
// it needs no per-site selectors and survives redesigns much better).
//
// `config.css` selectors MUST be verified against the real, current page
// by opening it in a browser devtools inspector -- they are not guessed
// here. See ./README.md for the workflow and why none of the bundled
// example configs ship with real selectors filled in.
export function createCssAdapter(config: LiveSiteConfig): StoreAdapter {
  if (!config.css) {
    throw new Error(`createCssAdapter: ${config.key} is missing a "css" selector config`);
  }
  const css = config.css;

  return {
    key: config.key,
    name: config.name,
    baseUrl: config.baseUrl,
    logoUrl: config.logoUrl,
    isLive: true,
    async search(query: string): Promise<StoreListingResult[]> {
      const url = config.buildSearchUrl(query);
      const html = await fetchHtml(url);
      if (!html) return [];

      const $ = cheerio.load(html);
      const results: StoreListingResult[] = [];

      $(css.item).each((_, el) => {
        const $el = $(el);
        const title = $el.find(css.title).first().text().trim();
        const priceText = $el.find(css.price).first().text().trim();
        const price = parsePrice(priceText);
        const hrefRaw = $el.find(css.link).first().attr("href");
        if (!title || price === null || !hrefRaw) return;

        const link = resolveUrl(hrefRaw, config.baseUrl);
        const imageRaw = css.image ? $el.find(css.image).first().attr("src") : undefined;

        results.push({
          title,
          price,
          currency: "ILS",
          url: link,
          imageUrl: imageRaw ? resolveUrl(imageRaw, config.baseUrl) : undefined,
          inStock: true,
        });
      });

      return results
        .map((r) => ({ ...r, score: relevanceScore(query, r.title) }))
        .filter((r) => r.score >= RELEVANCE_THRESHOLD)
        .sort((a, b) => b.score - a.score)
        .slice(0, config.maxResults ?? DEFAULT_MAX_RESULTS)
        .map(({ score, ...listing }) => listing);
    },
  };
}

function resolveUrl(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}
