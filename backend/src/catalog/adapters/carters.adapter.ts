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
  nameEn: "Carter's",
  baseUrl: BASE_URL,
  // /favicon.ico 404s (verified live -- Magento serves an error page at
  // that path here, not an icon). The actual favicon Magento is
  // configured with lives under /media/favicon and does resolve: a small
  // blue "C" mark, the real brand mark rather than a generic icon.
  logoUrl: `${BASE_URL}/media/favicon/stores/1/Untitled.jpg`,
  async fetchCatalog(): Promise<CatalogProduct[]> {
    const byId = new Map<string, CatalogProduct>();

    let page = 1;
    for (; page <= env.ingestMaxPagesPerSource; page++) {
      const url = `${BASE_URL}${CATEGORY_PATH}${page > 1 ? `?p=${page}` : ""}`;
      const html = await fetchText(url);
      if (!html) break;

      const found = extractProducts(html);
      if (found.length === 0) break;

      let added = 0;
      for (const product of found) {
        if (byId.has(product.externalId)) continue;
        byId.set(product.externalId, product);
        added++;
      }

      // A page past the real end doesn't necessarily come back empty --
      // see castro.adapter.ts's identical check, where this was confirmed
      // live (the theme just keeps re-serving its last real page). The
      // dedup above makes that harmless either way, but nothing used to
      // stop the loop over it, so a page contributing nothing new is the
      // real end-of-pagination signal, not just an empty one.
      if (added === 0) break;

      // A full page right at the cap means there may be genuinely more
      // catalogue past it.
      if (page === env.ingestMaxPagesPerSource) {
        console.warn(
          `[catalog] carters: hit the ${env.ingestMaxPagesPerSource}-page ingest cap with new products still coming back -- this category may have more products than were fetched`
        );
      }
    }

    return [...byId.values()];
  },
};

// Sizes come from the configurable-product payload the theme hands to its
// size selector -- one `"code":"size"` section per card, in the same order
// as the cards themselves, so each product takes the first section that
// follows it. The option entries are matched individually because the
// array can't be delimited by its closing bracket: every entry contains a
// nested `"products":[...]` array of its own.
const SIZE_SECTION_RE = /"code":"size"/g;
const SIZE_OPTION_RE = /"id":"\d+","label":"([^"]+)","products":/g;

function extractProducts(html: string): CatalogProduct[] {
  const sizeSectionStarts = [...html.matchAll(SIZE_SECTION_RE)].map((m) => m.index!);

  const results: CatalogProduct[] = [];
  for (const match of html.matchAll(PRODUCT_BLOCK_RE)) {
    const [, imageUrl, href, onclickRaw, titleRaw] = match;
    const onclick = decodeHtmlEntities(onclickRaw);
    const sizes = sizesAfter(html, sizeSectionStarts, match.index!);

    const idMatch = onclick.match(/"id":"(\d+)"/);
    const priceMatch = onclick.match(/"price":"([\d.]+)"/);
    if (!idMatch || !priceMatch) continue;

    const price = Number(priceMatch[1]);
    if (!Number.isFinite(price) || price <= 0) continue;

    // The theme renders the pre-discount price into the card's own price
    // box ("מחיר מלא"), hidden until the discount applies. It's read out
    // of the matched card block rather than from a page-wide lookup: the
    // GTM payload's `id` is a different identifier from the Magento
    // entity id the price box is keyed by (verified live -- zero overlap
    // between the two sets), so position within the card is the only
    // reliable join. 12 of 48 cards on page 1 carry one.
    const listMatch = match[0].match(/id="old-price-\d+"\s+data-price-amount="([\d.]+)"/);
    const listPrice = listMatch ? Number(listMatch[1]) : NaN;

    results.push({
      externalId: idMatch[1],
      title: decodeHtmlEntities(titleRaw).trim(),
      price,
      ...(Number.isFinite(listPrice) && listPrice > price ? { listPrice } : {}),
      currency: "ILS",
      url: href,
      imageUrl,
      category: "בגדי תינוקות וילדים",
      inStock: true,
      sizes,
    });
  }
  return results;
}

function sizesAfter(html: string, sectionStarts: number[], productIndex: number): string[] | undefined {
  const start = sectionStarts.find((i) => i > productIndex);
  if (start === undefined) return undefined;
  const end = sectionStarts.find((i) => i > start) ?? html.length;

  const labels = [...html.slice(start, end).matchAll(SIZE_OPTION_RE)].map((m) => m[1]);
  return labels.length > 0 ? labels : undefined;
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
