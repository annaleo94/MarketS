import { prisma } from "../db/prisma";
import { normalizeQuery, relevanceScore } from "../scrapers/normalize";
import { parseQuery, ParsedQuery } from "../search/parse-query";
import { categoryWithDescendants, categoryAncestors, categoryLabel } from "../catalog/taxonomy";
import { productHasSize } from "../catalog/sizes";
import { productColors } from "../catalog/colors";
import { env } from "../env";

export interface SearchResultItem {
  id: string;
  title: string;
  price: number;
  currency: string;
  url: string;
  imageUrl: string | null;
  inStock: boolean;
  sizes: string | null;
  color: string | null;
  colors: string[]; // every colour in the listing -- more than one for a multipack
  colorMatch: ColorMatch;
  categorySlug: string | null;
  gender: string;
  score: number;
}

export interface StoreResults {
  store: { key: string; name: string; baseUrl: string; logoUrl: string | null };
  count: number;
  items: SearchResultItem[];
}

export interface AppliedFilter {
  kind: "category" | "size" | "gender" | "color";
  label: string;
}

export interface SearchResponse {
  query: string;
  normalizedQuery: string;
  fetchedAt: string;
  cached: boolean;
  llmEnabled: boolean;
  filters: AppliedFilter[];
  stores: StoreResults[];
  totalCount: number;
  // True when nothing was found in the colour asked for, so what's listed
  // are near-misses rather than answers. The UI says so.
  showingAlternatives: boolean;
  // Set when the exact garment type asked for had nothing and the search
  // climbed to a broader one; holds that broader category's label.
  widenedToCategory: string | null;
}

const GENDER_LABELS: Record<string, string> = { girls: "בנות", boys: "בנים", unisex: "יוניסקס" };

// How an item answers the colour the shopper asked for. Colour stays a soft
// signal -- nothing is deleted for it -- but it decides the order, because
// price-sorting the whole set alone put a ₪9.9 grey bodysuit above every
// white shirt in a search for a white shirt.
//   exact   - the garment is that colour
//   pack    - a multipack that includes it, or a colour-blocked garment
//   unknown - no colour on record, so we can't say either way
//   other   - a colour we know, and it isn't the one asked for
export type ColorMatch = "exact" | "pack" | "unknown" | "other";

const COLOR_MATCH_RANK: Record<ColorMatch, number> = { exact: 0, pack: 1, unknown: 2, other: 3 };

function colorMatchFor(
  product: { color: string | null; colors: string | null; colorIsSolid: boolean | null },
  wanted: string | null
): ColorMatch {
  if (!wanted) return "exact"; // nothing asked for, so nothing to fall short of
  const colors = productColors(product);
  if (colors.length === 0) return "unknown";
  if (!colors.includes(wanted)) return "other";
  return colors.length === 1 && product.colorIsSolid !== false ? "exact" : "pack";
}

export async function search(rawQuery: string, overrides?: Partial<ParsedQuery>): Promise<SearchResponse> {
  const normalizedQuery = normalizeQuery(rawQuery);
  if (!normalizedQuery) return emptyResponse(rawQuery, normalizedQuery);

  const cacheKey = buildCacheKey(normalizedQuery, overrides);
  const cached = await readFromCache(cacheKey);
  if (cached) {
    return {
      ...(JSON.parse(cached.resultsJson) as SearchResponse),
      cached: true,
      fetchedAt: cached.fetchedAt.toISOString(),
    };
  }

  const parsed = { ...(await parseQuery(rawQuery)), ...overrides };
  const response = await runSearch(rawQuery, normalizedQuery, parsed);
  await writeToCache(rawQuery, cacheKey, response);
  return response;
}

interface ScoredEntry {
  product: Awaited<ReturnType<typeof prisma.product.findMany>>[number];
  score: number;
  colorMatch: ColorMatch;
}

// The hard filters plus scoring, for one category slug (or none).
async function scoreCandidates(parsed: ParsedQuery, categorySlug: string | null): Promise<ScoredEntry[]> {
  const categorySlugs = categorySlug ? categoryWithDescendants(categorySlug) : null;

  const candidates = await prisma.product.findMany({
    where: {
      ...(categorySlugs ? { categorySlug: { in: categorySlugs } } : {}),
      // Unisex always passes a gendered request -- it fits either child.
      ...(parsed.gender && parsed.gender !== "unisex" ? { gender: { in: [parsed.gender, "unisex"] } } : {}),
      inStock: true,
    },
  });

  const sizeFiltered = parsed.size ? candidates.filter((p) => productHasSize(p.sizes, parsed.size!)) : candidates;

  // --- Soft signals. These only order what survived above.
  return sizeFiltered
    .map((product) => ({ product, score: scoreProduct(product, parsed), colorMatch: colorMatchFor(product, parsed.color) }))
    .filter((entry) => entry.score >= env.searchMinScore)
    .sort((a, b) => b.score - a.score);
}

async function runSearch(rawQuery: string, normalizedQuery: string, parsed: ParsedQuery): Promise<SearchResponse> {
  const stores = await prisma.store.findMany({ where: { active: true }, orderBy: { name: "asc" } });

  // --- Hard filters. Anything failing these is removed, not down-ranked:
  // no relevance score compensates for the wrong garment, size or gender.
  //
  // Most products are classified from the store's own category label, which
  // is coarse: TerminalX files every swimsuit, bikini and rash guard alike
  // under "בגדי ים". So an exact search for a child category can match
  // nothing at all while the parent holds hundreds -- "בגד ים שלם מידה 3"
  // returned zero next to 79 for "בגד ים מידה 3". A product sitting at the
  // parent isn't known *not* to be a swimsuit, so rather than show an empty
  // page we climb to the nearest ancestor that has anything, and say so.
  const attempts = parsed.categorySlug
    ? [parsed.categorySlug, ...categoryAncestors(parsed.categorySlug)]
    : [null];

  let scored: ScoredEntry[] = [];
  let usedCategory: string | null = parsed.categorySlug;

  for (const slug of attempts) {
    scored = await scoreCandidates(parsed, slug);
    usedCategory = slug;
    if (scored.length > 0) break;
  }

  const widenedToCategory = usedCategory !== parsed.categorySlug ? usedCategory : null;

  // Asked for a colour, and something actually comes in it? Then a garment
  // in a different colour is simply a wrong answer, and is dropped -- the
  // shopper asked for white. Only when nothing in the catalogue answers the
  // colour do the near-misses earn their place, shown and marked rather
  // than leaving the shopper with an empty page. Deciding this on the
  // colour tier rather than the score keeps it consistent: before, a
  // strongly-worded title absorbed the mismatch penalty and a blue bikini
  // came back for "ביקיני לבנה", while a plainly-titled grey shirt didn't.
  const onTarget = scored.filter((entry) => entry.colorMatch !== "other");
  const showingAlternatives = parsed.color !== null && onTarget.length === 0 && scored.length > 0;
  const visible = parsed.color && onTarget.length > 0 ? onTarget : scored;

  const byStore = new Map<string, SearchResultItem[]>();
  for (const { product, score, colorMatch } of visible) {
    const items = byStore.get(product.storeId) ?? [];
    items.push({
      id: product.id,
      title: product.title,
      price: product.price,
      currency: product.currency,
      url: product.url,
      imageUrl: product.imageUrl,
      inStock: product.inStock,
      sizes: product.sizes,
      color: product.color,
      colors: productColors(product),
      colorMatch,
      categorySlug: product.categorySlug,
      gender: product.gender,
      score,
    });
    byStore.set(product.storeId, items);
  }

  // Every store is listed, including ones with nothing -- that's what
  // shows the shopper we actually looked there, rather than leaving them
  // to wonder whether the store was searched at all.
  const storeResults: StoreResults[] = stores.map((store) => {
    const items = (byStore.get(store.id) ?? []).sort(compareForDisplay);
    return {
      store: { key: store.key, name: store.name, baseUrl: store.baseUrl, logoUrl: store.logoUrl },
      count: items.length,
      items,
    };
  });

  return {
    query: rawQuery,
    normalizedQuery,
    fetchedAt: new Date().toISOString(),
    cached: false,
    llmEnabled: env.llmEnabled,
    filters: describeFilters(parsed, usedCategory),
    stores: storeResults,
    totalCount: visible.length,
    showingAlternatives,
    widenedToCategory: widenedToCategory ? categoryLabel(widenedToCategory) : null,
  };
}

// Cheapest-first is the whole point of the tool, but only among items that
// actually answer the request: a shopper asking for a white shirt wants the
// cheapest *white* one, not the cheapest thing that happens to be a shirt.
// So colour tier leads and price sorts within it -- the near-misses are
// still there, listed after, and marked in the UI.
export function compareForDisplay(a: SearchResultItem, b: SearchResultItem): number {
  const tier = COLOR_MATCH_RANK[a.colorMatch] - COLOR_MATCH_RANK[b.colorMatch];
  return tier !== 0 ? tier : a.price - b.price;
}

// Ranking only. A colour or style mismatch pushes an item down the list;
// it never removes it, because the shopper may well still want it.
function scoreProduct(
  product: { title: string; color: string | null; colors: string | null; colorIsSolid: boolean | null },
  parsed: ParsedQuery
): number {
  let score = relevanceScore(parsed.semanticQuery, product.title);

  // Once the hard filters have guaranteed the garment type, a low text
  // score only means the wording differed from the listing -- so give the
  // survivors a floor instead of letting the threshold empty out a set
  // that is already known to be the right kind of product. Applied before
  // the soft signals below, which would otherwise be silently erased by it.
  if (parsed.categorySlug) score = Math.max(score, 0.5);

  // Only a bonus: a mismatch is handled by the colour tier in runSearch,
  // not by a penalty here, which a strongly-worded title could out-score.
  if (parsed.color) {
    const match = colorMatchFor(product, parsed.color);
    if (match === "exact") score += 0.6;
    else if (match === "pack") score += 0.3;
  }

  if (parsed.style && relevanceScore(parsed.style, product.title) > 0.5) score += 0.2;

  return Math.max(0, Math.min(1.5, score));
}

// The category chip shows what was actually searched, which after a widen
// is the broader one -- promising "בגד ים שלם" over a list of swimwear
// generally would be a chip that lies about its own results.
function describeFilters(parsed: ParsedQuery, usedCategory: string | null): AppliedFilter[] {
  const filters: AppliedFilter[] = [];
  if (usedCategory) filters.push({ kind: "category", label: categoryLabel(usedCategory) });
  if (parsed.size) {
    filters.push({ kind: "size", label: parsed.sizeLabel ?? `${parsed.size.min}-${parsed.size.max} חודשים` });
  }
  if (parsed.gender) filters.push({ kind: "gender", label: GENDER_LABELS[parsed.gender] ?? parsed.gender });
  if (parsed.color) filters.push({ kind: "color", label: parsed.color });
  return filters;
}

// Cached rows hold a whole serialised SearchResponse, so a build that
// changes that shape -- or changes how results are ranked or ordered --
// would go on serving the old one until the TTL ran out, quietly missing
// the new fields. Bump this whenever either changes; old entries then miss
// and are rewritten rather than being served half-formed.
const RESULTS_SCHEMA_VERSION = 4;

function buildCacheKey(normalizedQuery: string, overrides?: Partial<ParsedQuery>): string {
  const base = `v${RESULTS_SCHEMA_VERSION}:${normalizedQuery}`;
  if (!overrides || Object.keys(overrides).length === 0) return base;
  // Removing a filter is a different search, so it needs its own entry.
  return `${base}::${JSON.stringify(overrides)}`;
}

function emptyResponse(rawQuery: string, normalizedQuery: string): SearchResponse {
  return {
    query: rawQuery,
    normalizedQuery,
    fetchedAt: new Date().toISOString(),
    cached: false,
    llmEnabled: env.llmEnabled,
    filters: [],
    stores: [],
    totalCount: 0,
    showingAlternatives: false,
    widenedToCategory: null,
  };
}

async function readFromCache(cacheKey: string) {
  const row = await prisma.searchCache.findUnique({ where: { normalizedQuery: cacheKey } });
  if (!row) return null;
  const ageMinutes = (Date.now() - row.fetchedAt.getTime()) / 60_000;
  return ageMinutes > env.searchCacheTtlMinutes ? null : row;
}

async function writeToCache(rawQuery: string, cacheKey: string, response: SearchResponse): Promise<void> {
  await prisma.searchCache.upsert({
    where: { normalizedQuery: cacheKey },
    update: { rawQuery, resultsJson: JSON.stringify(response), fetchedAt: new Date() },
    create: { rawQuery, normalizedQuery: cacheKey, resultsJson: JSON.stringify(response) },
  });
}
