import { CatalogAdapter, CatalogProduct } from "../types";
import { fetchText } from "../http";
import { env } from "../../env";

const BASE_URL = "https://www.cartersoshkosh.co.il";
// A broad, already-baby/kids-only category page (Carter's/OshKosh sells
// nothing else). Verified 2026-09: server-rendered (Magento + Hyva theme,
// not a client-side SPA), paginated via `?p=N`.
const CATEGORY_PATH = "/בגדי-תינוקות-מעוצבים";

// Each product card embeds a Google-Tag-Manager click-tracking payload
// (`onclick="...dataLayer.push({...,'products':[{name,id,price,category}]})..."`)
// right next to its thumbnail and title link. That JSON blob is a more
// stable, more structured source than trying to hand-pick price/title CSS
// classes out of the Tailwind-utility soup Hyva generates -- verified
// against the live category page (48/48 product cards matched cleanly).
const PRODUCT_BLOCK_RE =
  /<img[^>]*class="[^"]*product-image-photo[^"]*"[^>]*src="([^"]+)"[^>]*>[\s\S]*?<a class="product-item-link"\s+href="([^"]+)"\s+onclick="([^"]*)"\s*>([^<]*)<\/a>/g;

export const cartersAdapter: CatalogAdapter = {
  key: "carters",
  name: "קרטרס",
  baseUrl: BASE_URL,
  logoUrl: `${BASE_URL}/favicon.ico`,
  async fetchCatalog(): Promise<CatalogProduct[]> {
    const byId = new Map<string, CatalogProduct>();

    for (let page = 1; page <= env.ingestMaxPagesPerSource; page++) {
      const url = `${BASE_URL}${CATEGORY_PATH}${page > 1 ? `?p=${page}` : ""}`;
      const html = await fetchText(url);
      if (!html) break;

      const found = extractProducts(html);
      if (found.length === 0) break;

      for (const product of found) {
        if (!byId.has(product.externalId)) byId.set(product.externalId, product);
      }
    }

    return [...byId.values()];
  },
};

function extractProducts(html: string): CatalogProduct[] {
  const results: CatalogProduct[] = [];
  for (const match of html.matchAll(PRODUCT_BLOCK_RE)) {
    const [, imageUrl, href, onclickRaw, titleRaw] = match;
    const onclick = decodeHtmlEntities(onclickRaw);

    const idMatch = onclick.match(/"id":"(\d+)"/);
    const priceMatch = onclick.match(/"price":"([\d.]+)"/);
    if (!idMatch || !priceMatch) continue;

    const price = Number(priceMatch[1]);
    if (!Number.isFinite(price) || price <= 0) continue;

    results.push({
      externalId: idMatch[1],
      title: decodeHtmlEntities(titleRaw).trim(),
      price,
      currency: "ILS",
      url: href,
      imageUrl,
      category: "בגדי תינוקות וילדים",
      inStock: true,
    });
  }
  return results;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}
