import * as cheerio from "cheerio";
import { StoreAdapter, StoreListingResult } from "../../types";
import { relevanceScore } from "../../normalize";
import { LiveSiteConfig } from "./site-config";
import { fetchHtml } from "./http";
import { parsePrice } from "./price-parse";

const RELEVANCE_THRESHOLD = 0.4;
const DEFAULT_MAX_RESULTS = 8;

// Scrapes a store's search-results page by reading the schema.org JSON-LD
// (`<script type="application/ld+json">`) that most modern storefront
// platforms (Shopify, WooCommerce/WordPress, Magento, and plenty of
// Israeli-built shops) already embed for SEO. This is far more stable than
// guessing CSS class names -- it keeps working across the site's own
// front-end redesigns as long as the structured data stays in place.
//
// Falls back to nothing (empty array) if the page has no Product JSON-LD;
// pair the store with the CSS adapter in that case (see generic-css.adapter.ts).
export function createJsonLdAdapter(config: LiveSiteConfig): StoreAdapter {
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

      const products = extractJsonLdProducts(html, url);
      return products
        .map((p) => ({ ...p, score: relevanceScore(query, p.title) }))
        .filter((p) => p.score >= RELEVANCE_THRESHOLD)
        .sort((a, b) => b.score - a.score)
        .slice(0, config.maxResults ?? DEFAULT_MAX_RESULTS)
        .map(({ score, ...listing }) => listing);
    },
  };
}

function extractJsonLdProducts(html: string, pageUrl: string): StoreListingResult[] {
  const $ = cheerio.load(html);
  const results: StoreListingResult[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return; // malformed JSON-LD block, skip it
    }

    for (const node of flattenJsonLd(parsed)) {
      const listing = productNodeToListing(node, pageUrl);
      if (listing) results.push(listing);
    }
  });

  return results;
}

// JSON-LD can be a single object, an array of objects, or an object with a
// "@graph" array -- normalize all three into a flat list of nodes.
function flattenJsonLd(node: unknown): Record<string, any>[] {
  if (Array.isArray(node)) return node.flatMap(flattenJsonLd);
  if (node && typeof node === "object") {
    const obj = node as Record<string, any>;
    if (Array.isArray(obj["@graph"])) return obj["@graph"].flatMap(flattenJsonLd);
    return [obj];
  }
  return [];
}

function productNodeToListing(node: Record<string, any>, pageUrl: string): StoreListingResult | null {
  const type = node["@type"];
  const isProduct = type === "Product" || (Array.isArray(type) && type.includes("Product"));
  if (!isProduct || !node.name) return null;

  const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers;
  const priceRaw = offer?.price ?? offer?.lowPrice;
  const price = typeof priceRaw === "number" ? priceRaw : parsePrice(String(priceRaw ?? ""));
  if (price === null) return null;

  const image = Array.isArray(node.image) ? node.image[0] : node.image;
  const link = offer?.url || node.url || pageUrl;

  return {
    title: String(node.name),
    price,
    currency: offer?.priceCurrency || "ILS",
    url: resolveUrl(link, pageUrl),
    imageUrl: typeof image === "string" ? image : image?.url,
    inStock: offer?.availability ? !String(offer.availability).toLowerCase().includes("outofstock") : true,
  };
}

function resolveUrl(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}
