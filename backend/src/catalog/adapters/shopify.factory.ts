import { CatalogAdapter, CatalogProduct } from "../types";
import { fetchJson } from "../http";
import { env } from "../../env";

interface ShopifyVariant {
  price: string;
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
    baseUrl: config.baseUrl,
    logoUrl: config.logoUrl,
    async fetchCatalog(): Promise<CatalogProduct[]> {
      const byId = new Map<number, CatalogProduct>();

      for (const handle of config.collectionHandles) {
        for (let page = 1; page <= env.ingestMaxPagesPerSource; page++) {
          const url = `${config.baseUrl}/collections/${handle}/products.json?limit=250&page=${page}`;
          const data = await fetchJson<ShopifyProductsResponse>(url);
          const products = data?.products ?? [];
          if (products.length === 0) break;

          for (const p of products) {
            if (byId.has(p.id)) continue;
            const listing = toCatalogProduct(p, config);
            if (listing) byId.set(p.id, listing);
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

  return {
    externalId: String(p.id),
    title: p.title,
    price,
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
