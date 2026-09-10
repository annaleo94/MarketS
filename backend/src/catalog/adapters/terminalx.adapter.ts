import { CatalogAdapter, CatalogProduct } from "../types";
import { fetchText } from "../http";
import { env } from "../../env";

const BASE_URL = "https://www.terminalx.com";

// Crawled per garment type rather than through the store's two "everything"
// listings. Those hold 3,824 and 9,286 products, far more than a courteous
// crawl can take, and they sort newest-first -- so a capped crawl in
// September returned autumn arrivals and almost no swimwear at all. Per
// type, the cap applies to each kind of garment separately: swimwear (85
// baby + 166 kids) now arrives whole instead of being buried behind
// thousands of coats.
//
// Paths verified 2026-09 against the site's own sitemap; every one of them
// returns a listing.
const CATEGORY_PATHS = [
  "/kids/baby/swimwear",
  "/kids/baby/shirts",
  "/kids/baby/pants-leggings",
  "/kids/baby/dresses-skirts",
  "/kids/baby/bodysuits-overalls",
  "/kids/baby/sets-packs",
  "/kids/baby/pajamas-underwear",
  "/kids/baby/jackets-coats",
  "/kids/baby/sweatshirts-jumpers",
  "/kids/baby/accessories",
  "/kids/baby/shoes",
  "/kids/all/swimwear",
  "/kids/all/shirts",
  "/kids/all/pants",
  "/kids/all/dresses-skirts",
  "/kids/all/pyjamas-underwear",
  "/kids/all/sweatshirts-jumpers",
  "/kids/all/jackets-coats",
  "/kids/all/shoes",
];

// The listing honours ?pageSize (the storefront's own paging parameter);
// ?limit and ?product_list_limit are ignored. The bytes per product are the
// same whatever the page size, so asking for more per request means fewer
// round trips for the same data -- and at 192 most of these categories
// arrive complete in one. robots.txt disallows ?limit=all, ?dir and ?mode,
// none of which are used here.
const PAGE_SIZE = 192;

// A full page of 192 products is ~9MB of server-rendered state, so it needs
// considerably longer than the default fetch timeout.
const FETCH_TIMEOUT_MS = 90000;

// The storefront is a React app that renders server-side and hands the
// client its state in `window.__INITIAL_STATE__` -- the same Magento
// GraphQL payload its own product grid draws from. That is a far better
// source than the markup around it: prices, stock, sizes and colours all
// arrive structured and typed, with no CSS selectors to keep in sync.
//
// The blob is JS, not JSON: Magento escapes a literal "</script>" inside
// it by splitting the string ("<"+"script>"), which JSON.parse chokes on.
// Those splices are rejoined before parsing. An unescaped `"+"` can only
// be one of them -- inside a real string value the quotes would be
// backslash-escaped.
const STATE_MARKER = "window.__INITIAL_STATE__ = ";

interface TxSwatchValue {
  label?: string;
}

interface TxConfigurableOption {
  attribute_code?: string;
  values?: TxSwatchValue[];
}

interface TxImage {
  label?: string;
  url?: string;
}

interface TxItem {
  sku?: string;
  image?: TxImage;
  thumbnail?: TxImage;
  stock_status2?: string;
  configurable_options?: TxConfigurableOption[];
  price_range?: {
    minimum_price?: { final_price?: { value?: number } };
  };
  tx_labels?: Record<string, string | null>;
}

export const terminalxAdapter: CatalogAdapter = {
  key: "terminalx",
  name: "טרמינל X",
  baseUrl: BASE_URL,
  logoUrl: `${BASE_URL}/favicon.ico`,
  async fetchCatalog(): Promise<CatalogProduct[]> {
    const bySku = new Map<string, CatalogProduct>();

    for (const path of CATEGORY_PATHS) {
      for (let page = 1; page <= env.ingestMaxPagesPerSource; page++) {
        const url = `${BASE_URL}${path}?pageSize=${PAGE_SIZE}${page > 1 ? `&p=${page}` : ""}`;
        const html = await fetchText(url, FETCH_TIMEOUT_MS);
        if (!html) break;

        const items = extractItems(html);
        if (items.length === 0) break;

        for (const item of items) {
          const listing = toCatalogProduct(item);
          if (listing && !bySku.has(listing.externalId)) bySku.set(listing.externalId, listing);
        }
      }
    }

    return [...bySku.values()];
  },
};

function extractItems(html: string): TxItem[] {
  const start = html.indexOf(STATE_MARKER);
  if (start === -1) return [];

  const from = start + STATE_MARKER.length;
  const end = html.indexOf("</script>", from);
  if (end === -1) return [];

  const blob = html.slice(from, end).trim().replace(/;$/, "").split('"+"').join("");

  try {
    const state = JSON.parse(blob);
    const items = state?.listingAndSearchStoreData?.data?.listing?.products?.items;
    return Array.isArray(items) ? items : [];
  } catch {
    console.warn("[catalog] terminalx: could not parse embedded state");
    return [];
  }
}

function toCatalogProduct(item: TxItem): CatalogProduct | null {
  const sku = item.sku?.trim();
  const title = (item.image?.label ?? item.thumbnail?.label ?? "").trim();
  const price = item.price_range?.minimum_price?.final_price?.value;
  if (!sku || !title || !price || price <= 0) return null;

  const labels = item.tx_labels ?? {};

  return {
    externalId: sku,
    title: withBrand(title, labels.brand),
    price,
    currency: "ILS",
    // Product pages live at the root under the lowercased SKU -- confirmed
    // against the sitemap and by fetching them.
    url: `${BASE_URL}/${sku.toLowerCase()}`,
    imageUrl: item.image?.url ?? item.thumbnail?.url,
    // `div` is the store's own garment type ("סוודרים וסריגים", "נעליים").
    category: labels.div ?? undefined,
    inStock: item.stock_status2 === "IN_STOCK",
    sizes: optionValues(item, "size"),
    // `div_top` is the audience segment ("בייבי בנים", "בייבי בנות").
    storeGender: labels.div_top ?? undefined,
    // Colours come from the configurable options -- the variants actually
    // offered. NOT from tx_labels.color_group, which reads as a
    // merchandising bucket rather than the garment's colour: on a sample of
    // 24 it disagreed with the variant colours 21 times, calling beige,
    // white, brown and pink items alike "שחור". Spot-checked against the
    // product photos, the variant colours were right every time and the
    // group was wrong every time.
    //
    // A product offered in several colours is stored with all of them, the
    // same way a multipack is: someone after a white cardigan is genuinely
    // served by one sold in white and pink.
    colors: optionValues(item, "color"),
  };
}

function optionValues(item: TxItem, code: string): string[] | undefined {
  const values = (item.configurable_options ?? [])
    .filter((option) => option.attribute_code === code)
    .flatMap((option) => option.values ?? [])
    .map((value) => value.label?.trim())
    .filter((label): label is string => !!label);

  return values.length > 0 ? [...new Set(values)] : undefined;
}

// TerminalX sells many brands, and its product names often don't say which
// ("סווטשירט ANGELES" is a MANGO). Appending it lets a shopper search by
// brand at all, which on a marketplace is how people actually shop.
function withBrand(title: string, brand: string | null | undefined): string {
  if (!brand) return title;
  return title.toLowerCase().includes(brand.toLowerCase()) ? title : `${title} ${brand}`;
}
