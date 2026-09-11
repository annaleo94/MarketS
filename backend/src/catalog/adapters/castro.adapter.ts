import { CatalogAdapter, CatalogProduct } from "../types";
import { fetchText } from "../http";
import { env } from "../../env";

const BASE_URL = "https://www.castro.com";

// Castro is Magento (a custom "Idus" theme, not stock Luma). Its top-level
// department pages (/ילדים, /ילדות, /תינוקות) are pure category-tree hubs
// with no products of their own -- verified 2026-09 by fetching them and
// finding zero price/jsonConfig blocks despite a 200 and a full page of
// HTML. The actual listings live one level down, so each entry here is a
// real, product-bearing "view all for this garment type" page, confirmed
// individually against the live site.
//
// `category` is a taxonomy hint applied to every item from that page; left
// undefined where a department mixes garment types Castro doesn't split
// out for us (underwear+socks, dresses+skirts, kindergarten bundles) --
// classifyCatalog() then reads the actual garment type off each title
// instead, the same fallback Fox's uncategorised third already relies on.
const CATEGORY_PATHS: { path: string; category?: string; storeGender?: string }[] = [
  { path: "ילדים/חולצות-גופיות", category: "חולצות", storeGender: "בנים" },
  { path: "ילדים/מכנסיים", category: "מכנסיים", storeGender: "בנים" },
  { path: "ילדים/מעילים-וגקטים", category: "מעיל", storeGender: "בנים" },
  { path: "ילדים/נעליים", category: "נעל", storeGender: "בנים" },
  { path: "ילדים/סריגים-ופוטרים", category: "סריג", storeGender: "בנים" },
  { path: "ילדים/הלבשה-תחתונה", storeGender: "בנים" },
  { path: "ילדים/חליפות-גן", storeGender: "בנים" },
  { path: "ילדות/חולצות", category: "חולצות", storeGender: "בנות" },
  { path: "ילדות/מכנסיים", category: "מכנסיים", storeGender: "בנות" },
  { path: "ילדות/מעילים-וגקטים", category: "מעיל", storeGender: "בנות" },
  { path: "ילדות/נעליים", category: "נעל", storeGender: "בנות" },
  { path: "ילדות/סריגים-ופוטרים", category: "סריג", storeGender: "בנות" },
  { path: "ילדות/הלבשה-תחתונה", storeGender: "בנות" },
  { path: "ילדות/שמלות-חצאיות", storeGender: "בנות" },
  { path: "ילדות/מארזים-חליפות-גן", storeGender: "בנות" },
  { path: "תינוקות/תינוק", storeGender: "בנים" },
  { path: "תינוקות/תינוקת", storeGender: "בנות" },
  { path: "תינוקות/ניובורן-עד-שנה-מארזים" },
];

interface WishlistData {
  sku?: string;
  name?: string;
  image?: string;
  url?: string;
}

interface SwatchOption {
  id?: string;
  label?: string;
  products?: { stock?: string[] };
}

interface SwatchAttribute {
  code?: string;
  options?: SwatchOption[];
}

interface SwatchJsonConfig {
  productId?: string;
  attributes?: Record<string, SwatchAttribute>;
  optionPrices?: Record<string, { finalPrice?: { amount?: number } }>;
}

export const castroAdapter: CatalogAdapter = {
  key: "castro",
  name: "קסטרו קידס",
  baseUrl: BASE_URL,
  logoUrl: `${BASE_URL}/favicon.ico`,
  async fetchCatalog(): Promise<CatalogProduct[]> {
    const byId = new Map<string, CatalogProduct>();

    for (const { path, category, storeGender } of CATEGORY_PATHS) {
      let page = 1;
      for (; page <= env.ingestMaxPagesPerSource; page++) {
        const url = `${BASE_URL}/${path}${page > 1 ? `?p=${page}` : ""}`;
        const html = await fetchText(url);
        if (!html) break;

        const products = extractProducts(html, category, storeGender);
        if (products.length === 0) break;

        for (const product of products) {
          if (!byId.has(product.externalId)) byId.set(product.externalId, product);
        }

        // See shopify.factory.ts's identical check: a non-empty page right
        // at the cap means there may be more catalogue this run never saw.
        if (page === env.ingestMaxPagesPerSource) {
          console.warn(
            `[catalog] castro/${path}: hit the ${env.ingestMaxPagesPerSource}-page ingest cap with a full page still coming back -- this category may have more products than were fetched`
          );
        }
      }
    }

    return [...byId.values()];
  },
};

// The wishlist button on every card carries a `product_data` JSON blob --
// sku, name, image, url -- keyed to a `product_id` on the same element.
// Verified: this id is the same "productId" the swatch config below uses,
// 1:1, on every one of the 18 category pages this adapter reads.
const WISHLIST_RE = /product_id="(\d+)"\s+simple_id="[^"]*"\s+product_data='([^']*)'/g;

function extractProducts(html: string, category: string | undefined, storeGender: string | undefined): CatalogProduct[] {
  const wishlist = new Map<string, WishlistData>();
  for (const match of html.matchAll(WISHLIST_RE)) {
    const [, id, json] = match;
    try {
      wishlist.set(id, JSON.parse(json));
    } catch {
      // malformed blob for this one card -- skip it, not the whole page
    }
  }

  const configs = extractSwatchConfigs(html);

  const results: CatalogProduct[] = [];
  for (const [id, data] of wishlist) {
    const config = configs.get(id);
    if (!data.name || !data.url || !config) continue;

    const price = minFinalPrice(config);
    if (!price || price <= 0) continue;

    const sizeAttr = Object.values(config.attributes ?? {}).find((a) => a.code === "size");
    const inStockSizes = (sizeAttr?.options ?? []).filter((o) => (o.products?.stock?.length ?? 0) > 0);

    results.push({
      externalId: id,
      title: data.name,
      price,
      currency: "ILS",
      url: data.url,
      imageUrl: data.image,
      category,
      inStock: inStockSizes.length > 0,
      sizes: inStockSizes.length > 0 ? inStockSizes.map((o) => o.label ?? "").filter(Boolean) : undefined,
      storeGender,
    });
  }
  return results;
}

// Every swatch config is its own `<script type='text/x-magento-init'>`
// block; found by scanning for the opening tag and taking everything up
// to the next literal `</script>` rather than a regex spanning the whole
// (large) block, which avoids pathological backtracking on a big page.
function extractSwatchConfigs(html: string): Map<string, SwatchJsonConfig> {
  const configs = new Map<string, SwatchJsonConfig>();
  const marker = "<script type='text/x-magento-init'>";

  let from = 0;
  while (true) {
    const start = html.indexOf(marker, from);
    if (start === -1) break;
    const contentStart = start + marker.length;
    const end = html.indexOf("</script>", contentStart);
    if (end === -1) break;
    from = end + 1;

    const blob = html.slice(contentStart, end).trim();
    if (!blob.includes("jsonConfig")) continue;

    try {
      const parsed = JSON.parse(blob);
      for (const entry of Object.values(parsed) as Record<string, unknown>[]) {
        const renderer = entry["idus_product-swatch_renderer"] as { jsonConfig?: SwatchJsonConfig } | undefined;
        const config = renderer?.jsonConfig;
        if (config?.productId) configs.set(config.productId, config);
      }
    } catch {
      // one malformed config block -- skip it, keep the rest of the page
    }
  }
  return configs;
}

function minFinalPrice(config: SwatchJsonConfig): number | null {
  const amounts = Object.values(config.optionPrices ?? {})
    .map((p) => p.finalPrice?.amount)
    .filter((n): n is number => typeof n === "number" && n > 0);
  return amounts.length > 0 ? Math.min(...amounts) : null;
}
