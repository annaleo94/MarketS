import { prisma } from "../db/prisma";
import { normalizeQuery, relevanceScore } from "../scrapers/normalize";
import { parseQuery, ParsedQuery } from "../search/parse-query";
import { categoryWithDescendants, categoryLabel } from "../catalog/taxonomy";
import { productHasSize } from "../catalog/sizes";
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
}

const GENDER_LABELS: Record<string, string> = { girls: "בנות", boys: "בנים", unisex: "יוניסקס" };

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

async function runSearch(rawQuery: string, normalizedQuery: string, parsed: ParsedQuery): Promise<SearchResponse> {
  const stores = await prisma.store.findMany({ where: { active: true }, orderBy: { name: "asc" } });

  // --- Hard filters. Anything failing these is removed, not down-ranked:
  // no relevance score compensates for the wrong garment, size or gender.
  const categorySlugs = parsed.categorySlug ? categoryWithDescendants(parsed.categorySlug) : null;

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
  const scored = sizeFiltered
    .map((product) => ({ product, score: scoreProduct(product, parsed) }))
    .filter((entry) => entry.score >= env.searchMinScore)
    .sort((a, b) => b.score - a.score);

  const byStore = new Map<string, SearchResultItem[]>();
  for (const { product, score } of scored) {
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
    const items = (byStore.get(store.id) ?? []).sort((a, b) => a.price - b.price);
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
    filters: describeFilters(parsed),
    stores: storeResults,
    totalCount: scored.length,
  };
}

// Ranking only. A colour or style mismatch pushes an item down the list;
// it never removes it, because the shopper may well still want it.
function scoreProduct(
  product: { title: string; color: string | null; colorIsSolid: boolean | null },
  parsed: ParsedQuery
): number {
  let score = relevanceScore(parsed.semanticQuery, product.title);

  if (parsed.color) {
    if (product.color === parsed.color) score += product.colorIsSolid === false ? 0.3 : 0.6;
    else if (product.color) score -= 0.2;
  }

  if (parsed.style && relevanceScore(parsed.style, product.title) > 0.5) score += 0.2;

  // Once the hard filters have guaranteed the garment type, a low text
  // score only means the wording differed from the listing -- so give the
  // survivors a floor instead of letting the threshold empty out a set
  // that is already known to be the right kind of product.
  if (parsed.categorySlug) score = Math.max(score, 0.5);

  return Math.max(0, Math.min(1.5, score));
}

function describeFilters(parsed: ParsedQuery): AppliedFilter[] {
  const filters: AppliedFilter[] = [];
  if (parsed.categorySlug) filters.push({ kind: "category", label: categoryLabel(parsed.categorySlug) });
  if (parsed.size) {
    filters.push({ kind: "size", label: parsed.sizeLabel ?? `${parsed.size.min}-${parsed.size.max} חודשים` });
  }
  if (parsed.gender) filters.push({ kind: "gender", label: GENDER_LABELS[parsed.gender] ?? parsed.gender });
  if (parsed.color) filters.push({ kind: "color", label: parsed.color });
  return filters;
}

function buildCacheKey(normalizedQuery: string, overrides?: Partial<ParsedQuery>): string {
  if (!overrides || Object.keys(overrides).length === 0) return normalizedQuery;
  // Removing a filter is a different search, so it needs its own entry.
  return `${normalizedQuery}::${JSON.stringify(overrides)}`;
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
