import { prisma } from "../db/prisma";
import { getActiveAdapters } from "../scrapers/registry";
import { normalizeQuery, relevanceScore } from "../scrapers/normalize";
import { withTimeout } from "../scrapers/with-timeout";
import { env } from "../env";

const ADAPTER_TIMEOUT_MS = 10_000;

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
}

export interface SearchResponse {
  query: string;
  normalizedQuery: string;
  fetchedAt: string;
  cached: boolean;
  results: SearchResultItem[];
}

export async function search(rawQuery: string): Promise<SearchResponse> {
  const normalizedQuery = normalizeQuery(rawQuery);
  if (!normalizedQuery) {
    return { query: rawQuery, normalizedQuery, fetchedAt: new Date().toISOString(), cached: false, results: [] };
  }

  const cached = await readFromCache(normalizedQuery);
  if (cached) {
    return { query: rawQuery, normalizedQuery, fetchedAt: cached.fetchedAt.toISOString(), cached: true, results: toResultItems(cached.listings) };
  }

  const results = await scrapeAllStores(normalizedQuery);
  const fetchedAt = await writeToCache(rawQuery, normalizedQuery, results);

  return {
    query: rawQuery,
    normalizedQuery,
    fetchedAt: fetchedAt.toISOString(),
    cached: false,
    results: results
      .map(({ store, title, price, currency, url, imageUrl, inStock }) => ({ store, title, price, currency, url, imageUrl, inStock }))
      .sort((a, b) => a.price - b.price),
  };
}

interface ScrapedListing {
  storeKey: string;
  store: SearchResultItem["store"];
  title: string;
  price: number;
  currency: string;
  url: string;
  imageUrl: string | null;
  inStock: boolean;
  matchScore: number;
}

async function scrapeAllStores(normalizedQuery: string): Promise<ScrapedListing[]> {
  const adapters = getActiveAdapters();

  const perStore = await Promise.allSettled(
    adapters.map((adapter) => withTimeout(adapter.search(normalizedQuery), ADAPTER_TIMEOUT_MS, adapter.key))
  );

  const listings: ScrapedListing[] = [];
  perStore.forEach((outcome, i) => {
    const adapter = adapters[i];
    if (outcome.status === "rejected") {
      console.warn(`[search] ${adapter.key} failed:`, outcome.reason?.message ?? outcome.reason);
      return;
    }
    for (const item of outcome.value) {
      listings.push({
        storeKey: adapter.key,
        store: { key: adapter.key, name: adapter.name, baseUrl: adapter.baseUrl, logoUrl: adapter.logoUrl ?? null, isLive: adapter.isLive },
        title: item.title,
        price: item.price,
        currency: item.currency ?? "ILS",
        url: item.url,
        imageUrl: item.imageUrl ?? null,
        inStock: item.inStock ?? true,
        matchScore: relevanceScore(normalizedQuery, item.title),
      });
    }
  });

  // One offer per store: keep each store's best-matching hit for this query.
  const bestPerStore = new Map<string, ScrapedListing>();
  for (const listing of listings) {
    const current = bestPerStore.get(listing.storeKey);
    if (!current || listing.matchScore > current.matchScore) {
      bestPerStore.set(listing.storeKey, listing);
    }
  }

  return [...bestPerStore.values()].sort((a, b) => a.price - b.price);
}

async function readFromCache(normalizedQuery: string) {
  const row = await prisma.searchCache.findUnique({
    where: { normalizedQuery },
    include: { listings: { include: { store: true } } },
  });
  if (!row) return null;

  const ageMinutes = (Date.now() - row.fetchedAt.getTime()) / 60_000;
  if (ageMinutes > env.searchCacheTtlMinutes) return null;

  return row;
}

async function writeToCache(rawQuery: string, normalizedQuery: string, listings: ScrapedListing[]): Promise<Date> {
  const storeIds = await resolveStoreIds(listings.map((l) => l.storeKey));

  // Replace any previous cache entry for this query (cascades its old listings).
  await prisma.searchCache.deleteMany({ where: { normalizedQuery } });

  const created = await prisma.searchCache.create({
    data: {
      rawQuery,
      normalizedQuery,
      listings: {
        create: listings
          .filter((l) => storeIds.has(l.storeKey))
          .map((l) => ({
            storeId: storeIds.get(l.storeKey)!,
            title: l.title,
            price: l.price,
            currency: l.currency,
            url: l.url,
            imageUrl: l.imageUrl,
            inStock: l.inStock,
            matchScore: l.matchScore,
          })),
      },
    },
  });

  return created.fetchedAt;
}

async function resolveStoreIds(storeKeys: string[]): Promise<Map<string, string>> {
  const stores = await prisma.store.findMany({ where: { key: { in: storeKeys } } });
  return new Map(stores.map((s) => [s.key, s.id]));
}

function toResultItems(listings: Array<{ store: { key: string; name: string; baseUrl: string; logoUrl: string | null; isLive: boolean }; title: string; price: number; currency: string; url: string; imageUrl: string | null; inStock: boolean }>): SearchResultItem[] {
  return [...listings]
    .sort((a, b) => a.price - b.price)
    .map((l) => ({
      store: { key: l.store.key, name: l.store.name, baseUrl: l.store.baseUrl, logoUrl: l.store.logoUrl, isLive: l.store.isLive },
      title: l.title,
      price: l.price,
      currency: l.currency,
      url: l.url,
      imageUrl: l.imageUrl,
      inStock: l.inStock,
    }));
}
