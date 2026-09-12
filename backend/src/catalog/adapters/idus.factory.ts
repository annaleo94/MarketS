import { CatalogAdapter, CatalogProduct } from "../types";
import { fetchText } from "../http";
import { env } from "../../env";

// Castro and Papaya both run Magento behind the same "Idus" theme, and it
// renders its product grids identically: each card carries a `product_data`
// JSON blob on its wishlist button (sku, name, image, url) and a
// `<script type='text/x-magento-init'>` swatch config holding that same
// product's prices, sizes and per-size stock, the two joined by a shared
// product id. Parsing that structured JSON is what this shares -- it is the
// theme's own data, not CSS selectors guessed off a rendered page, so it
// survives a restyle.

export interface IdusCategoryPath {
  path: string; // relative to baseUrl, e.g. "ילדים/מכנסיים"
  // A taxonomy hint applied to every item on that page. Left undefined
  // where a page mixes garment types the store doesn't split out for us --
  // classifyCatalog() then reads the type off each title instead.
  category?: string;
  storeGender?: string;
}

export interface IdusStoreConfig {
  key: string;
  name: string;
  nameEn: string;
  baseUrl: string; // no trailing slash
  logoUrl?: string;
  categoryPaths: IdusCategoryPath[];
  // Whether to walk `?p=2`, `?p=3`... past the first page of each category.
  // Not a preference: Papaya's robots.txt disallows `/*?`, i.e. every URL
  // carrying a query string at all, which is exactly how this theme
  // addresses page 2 onwards. So for that store the first page is the whole
  // of what we're allowed to read, and its own sitemap agrees -- it lists
  // category and product URLs, and not one of them carries a query string.
  // catalog/robots.ts would refuse those fetches anyway; saying so here
  // keeps the adapter honest about why its crawl stops where it does,
  // instead of quietly logging a "disallowed" warning per category.
  paginated: boolean;
}

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
  optionPrices?: Record<string, { finalPrice?: { amount?: number }; oldPrice?: { amount?: number } }>;
}

export function createIdusAdapter(config: IdusStoreConfig): CatalogAdapter {
  return {
    key: config.key,
    name: config.name,
    nameEn: config.nameEn,
    baseUrl: config.baseUrl,
    logoUrl: config.logoUrl,
    async fetchCatalog(): Promise<CatalogProduct[]> {
      const byId = new Map<string, CatalogProduct>();

      for (const { path, category, storeGender } of config.categoryPaths) {
        const lastPage = config.paginated ? env.ingestMaxPagesPerSource : 1;

        for (let page = 1; page <= lastPage; page++) {
          const url = `${config.baseUrl}/${path}${page > 1 ? `?p=${page}` : ""}`;
          const html = await fetchText(url);
          if (!html) break;

          const products = extractProducts(html, category, storeGender);
          if (products.length === 0) break;

          let added = 0;
          for (const product of products) {
            if (byId.has(product.externalId)) continue;
            byId.set(product.externalId, product);
            added++;
          }

          // A page past the real end of a category doesn't come back empty
          // -- this theme keeps re-serving its last real page instead.
          // Confirmed live on Castro: page 10, page 20 and page 40 of one
          // category all returned the exact same 13 products. The dedup
          // above kept that harmless, but nothing had ever stopped the
          // loop, so it ran the cap all the way to 40 reads of a 9MB page
          // for zero new data. A page that adds nothing new is the real
          // end signal.
          if (added === 0) break;

          // A full page right at the cap means there may be genuinely more
          // catalogue past it -- distinct from the case above, where the
          // page was non-empty but added nothing.
          if (page === lastPage && config.paginated) {
            console.warn(
              `[catalog] ${config.key}/${path}: hit the ${env.ingestMaxPagesPerSource}-page ingest cap with new products still coming back -- this category may have more products than were fetched`
            );
          }
        }
      }

      return [...byId.values()];
    },
  };
}

// The wishlist button on every card carries a `product_data` JSON blob --
// sku, name, image, url -- keyed to a `product_id` on the same element.
// Verified: this id is the same "productId" the swatch config below uses,
// 1:1, on every category page both stores serve. The attributes between the
// two are skipped rather than spelled out because the stores differ there:
// Castro emits a `simple_id` in the gap, Papaya emits nothing at all.
const WISHLIST_RE = /product_id="(\d+)"(?:\s+[a-zA-Z_-]+="[^"]*")*\s+product_data='([^']*)'/g;

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

    const pricing = minFinalPrice(config);
    if (!pricing) continue;

    const sizeAttr = Object.values(config.attributes ?? {}).find((a) => a.code === "size");
    const inStockSizes = (sizeAttr?.options ?? []).filter((o) => (o.products?.stock?.length ?? 0) > 0);

    results.push({
      externalId: id,
      title: data.name,
      price: pricing.price,
      ...(pricing.listPrice !== undefined ? { listPrice: pricing.listPrice } : {}),
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
        if (config?.productId) configs.set(String(config.productId), config);
      }
    } catch {
      // one malformed config block -- skip it, keep the rest of the page
    }
  }
  return configs;
}

// The cheapest variant's price, plus the "before" price Magento carries
// alongside it. `oldPrice` is the pre-discount price: on full-price items
// it simply equals finalPrice (verified across a whole category page --
// 234 variants, not one of them differing), and on a sale page it is the
// real shelf price (69.90 against a 33.33 final). The list price is taken
// from the same variant whose price is being quoted, not the maximum
// across variants, so a cheap size never gets advertised as a discount
// off an expensive one.
function minFinalPrice(config: SwatchJsonConfig): { price: number; listPrice?: number } | null {
  const priced = Object.values(config.optionPrices ?? {}).filter(
    (p) => typeof p.finalPrice?.amount === "number" && p.finalPrice.amount > 0
  );
  if (priced.length === 0) return null;

  const cheapest = priced.reduce((a, b) => (b.finalPrice!.amount! < a.finalPrice!.amount! ? b : a));
  const price = cheapest.finalPrice!.amount!;
  const listPrice = cheapest.oldPrice?.amount;

  return {
    price,
    ...(typeof listPrice === "number" && listPrice > price ? { listPrice } : {}),
  };
}
