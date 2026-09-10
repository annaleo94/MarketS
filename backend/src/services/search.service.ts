import { prisma } from "../db/prisma";
import { normalizeQuery } from "../scrapers/normalize";
import { matchInStore, CatalogEntry } from "../llm/match.service";
import { env } from "../env";

export interface SearchResultItem {
  store: {
    key: string;
    name: string;
    baseUrl: string;
    logoUrl: string | null;
    isLive: boolean;
  };
  title: string;
  price: number;
  currency: string;
  url: string;
  imageUrl: string | null;
  inStock: boolean;
  matchReason: string;
}

export interface SearchResponse {
  query: string;
  normalizedQuery: string;
  fetchedAt: string;
  cached: boolean;
  llmEnabled: boolean;
  results: SearchResultItem[];
}

export async function search(rawQuery: string): Promise<SearchResponse> {
  const normalizedQuery = normalizeQuery(rawQuery);
  if (!normalizedQuery) {
    return { query: rawQuery, normalizedQuery, fetchedAt: new Date().toISOString(), cached: false, llmEnabled: env.llmEnabled, results: [] };
  }

  const cached = await readFromCache(normalizedQuery);
  if (cached) {
    return {
      query: rawQuery,
      normalizedQuery,
      fetchedAt: cached.fetchedAt.toISOString(),
      cached: true,
      llmEnabled: env.llmEnabled,
      results: JSON.parse(cached.resultsJson),
    };
  }

  const results = await matchAcrossStores(rawQuery);
  const fetchedAt = await writeToCache(rawQuery, normalizedQuery, results);

  return { query: rawQuery, normalizedQuery, fetchedAt: fetchedAt.toISOString(), cached: false, llmEnabled: env.llmEnabled, results };
}

async function matchAcrossStores(rawQuery: string): Promise<SearchResultItem[]> {
  const stores = await prisma.store.findMany({
    where: { active: true },
    include: { products: true },
  });

  const perStore = await Promise.allSettled(
    stores.map(async (store) => {
      const catalog: CatalogEntry[] = store.products.map((p) => ({
        id: p.id,
        title: p.title,
        price: p.price,
        currency: p.currency,
        url: p.url,
        imageUrl: p.imageUrl,
        inStock: p.inStock,
      }));
      const match = await matchInStore(rawQuery, catalog);
      if (!match) return null;

      const item: SearchResultItem = {
        store: { key: store.key, name: store.name, baseUrl: store.baseUrl, logoUrl: store.logoUrl, isLive: store.isLive },
        title: match.product.title,
        price: match.product.price,
        currency: match.product.currency,
        url: match.product.url,
        imageUrl: match.product.imageUrl,
        inStock: match.product.inStock,
        matchReason: match.reason,
      };
      return item;
    })
  );

  const results: SearchResultItem[] = [];
  perStore.forEach((outcome, i) => {
    if (outcome.status === "rejected") {
      console.warn(`[search] ${stores[i].key} match failed:`, outcome.reason?.message ?? outcome.reason);
      return;
    }
    if (outcome.value) results.push(outcome.value);
  });

  return results.sort((a, b) => a.price - b.price);
}

async function readFromCache(normalizedQuery: string) {
  const row = await prisma.searchCache.findUnique({ where: { normalizedQuery } });
  if (!row) return null;

  const ageMinutes = (Date.now() - row.fetchedAt.getTime()) / 60_000;
  if (ageMinutes > env.searchCacheTtlMinutes) return null;

  return row;
}

async function writeToCache(rawQuery: string, normalizedQuery: string, results: SearchResultItem[]): Promise<Date> {
  const row = await prisma.searchCache.upsert({
    where: { normalizedQuery },
    update: { rawQuery, resultsJson: JSON.stringify(results), fetchedAt: new Date() },
    create: { rawQuery, normalizedQuery, resultsJson: JSON.stringify(results) },
  });
  return row.fetchedAt;
}
