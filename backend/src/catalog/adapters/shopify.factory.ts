import { CatalogAdapter, CatalogProduct } from "../types";
import { fetchJson } from "../http";
import { env } from "../../env";

interface ShopifyVariant {
  price: string;
  compare_at_price?: string | null; // the store's pre-discount price, when it publishes one
  available: boolean;
}

interface ShopifyImage {
  src: string;
}

interface ShopifyOption {
  name: string;
  values: string[];
}

interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  vendor?: string;
  product_type?: string;
  images: ShopifyImage[];
  variants: ShopifyVariant[];
  options?: ShopifyOption[];
}

interface ShopifyProductsResponse {
  products: ShopifyProduct[];
}

export interface ShopifyStoreConfig {
  key: string;
  name: string;
  nameEn: string;
  baseUrl: string; // e.g. "https://fox.co.il" -- no trailing slash
  logoUrl?: string;
  // Collection handles to pull, e.g. ["baby", "kids"] -- see each store's
  // /collections.json for the full list of handles.
  collectionHandles: string[];
  category: string; // label stored on Product.category
}

// Shopify stores publish a genuine, public JSON endpoint for every
// collection: GET /collections/<handle>/products.json?limit=250&page=N.
// It's the same data the storefront's own product grid renders from, just
// as JSON -- no HTML parsing, no CSS selectors to keep in sync with a
// redesign.
export function createShopifyAdapter(config: ShopifyStoreConfig): CatalogAdapter {
  return {
    key: config.key,
    name: config.name,
    nameEn: config.nameEn,
    baseUrl: config.baseUrl,
    logoUrl: config.logoUrl,
    async fetchCatalog(): Promise<CatalogProduct[]> {
      const byId = new Map<number, CatalogProduct>();

      for (const handle of config.collectionHandles) {
        let page = 1;
        for (; page <= env.ingestMaxPagesPerSource; page++) {
          const url = `${config.baseUrl}/collections/${handle}/products.json?limit=250&page=${page}`;
          const data = await fetchJson<ShopifyProductsResponse>(url);
          const products = data?.products ?? [];
          if (products.length === 0) break;

          let added = 0;
          for (const p of products) {
            if (byId.has(p.id)) continue;
            const listing = toCatalogProduct(p, config);
            if (listing) {
              byId.set(p.id, listing);
              added++;
            }
          }

          // Shopify's own JSON API reliably returns an empty array once a
          // collection is exhausted (unlike Castro's theme -- see that
          // adapter), so this is defence in depth rather than a fix for
          // an observed failure here: a page contributing nothing new is
          // treated as the end regardless of why.
          if (added === 0) break;

          // A full page right as the cap is reached means there's more
          // catalogue on the far side of it -- silent otherwise, and that
          // silence is exactly what let Fox and Shilav sit at a fraction
          // of their real size for a long time before anyone noticed.
          if (page === env.ingestMaxPagesPerSource) {
            console.warn(
              `[catalog] ${config.key}/${handle}: hit the ${env.ingestMaxPagesPerSource}-page ingest cap with new products still coming back -- this collection may have more products than were fetched`
            );
          }
        }
      }

      return [...byId.values()];
    },
  };
}

function toCatalogProduct(p: ShopifyProduct, config: ShopifyStoreConfig): CatalogProduct | null {
  const inStockVariants = p.variants.filter((v) => v.available);
  const pricedVariants = (inStockVariants.length > 0 ? inStockVariants : p.variants).filter(
    (v) => Number(v.price) > 0
  );
  if (pricedVariants.length === 0) return null;

  const price = Math.min(...pricedVariants.map((v) => Number(v.price)));

  // `price` is the cheapest variant, so the "before" price has to come
  // from that same variant to be comparable -- taking the highest
  // compare_at_price across a mixed-price product would invent a discount
  // that isn't on offer for the size being quoted.
  const cheapest = pricedVariants.find((v) => Number(v.price) === price);
  const listPrice = Number(cheapest?.compare_at_price);

  return {
    externalId: String(p.id),
    title: p.title,
    price,
    ...(Number.isFinite(listPrice) && listPrice > 0 ? { listPrice } : {}),
    currency: "ILS",
    url: `${config.baseUrl}/products/${p.handle}`,
    imageUrl: p.images[0]?.src,
    // The store's own garment type where it has one -- Fox populates this
    // properly, Shilav gives every product the same useless value.
    category: p.product_type || config.category,
    inStock: inStockVariants.length > 0,
    sizes: p.options?.find((o) => /size|מידה/i.test(o.name))?.values,
    // Fox uses `vendor` for its gender/age segment ("תינוקות בנות");
    // Shilav uses it for the actual brand, which simply yields no gender.
    storeGender: p.vendor,
  };
}
