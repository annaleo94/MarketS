import { prisma } from "../db/prisma";
import { catalogAdapters } from "./registry";
import { CatalogAdapter } from "./types";

export interface IngestSummary {
  store: string;
  fetched: number;
  removed: number;
}

// Pulls every configured store's catalog and upserts it into the DB,
// removing products that disappeared from the store since the last run
// (sold out & delisted, discontinued, etc). Safe to run repeatedly --
// `npm run ingest`, a cron job, or POST /api/admin/ingest all call this.
export async function runIngest(adapters: CatalogAdapter[] = catalogAdapters): Promise<IngestSummary[]> {
  const summaries: IngestSummary[] = [];

  for (const adapter of adapters) {
    const store = await prisma.store.upsert({
      where: { key: adapter.key },
      update: { name: adapter.name, baseUrl: adapter.baseUrl, logoUrl: adapter.logoUrl, isLive: true, active: true },
      create: { key: adapter.key, name: adapter.name, baseUrl: adapter.baseUrl, logoUrl: adapter.logoUrl, isLive: true, active: true },
    });

    console.log(`[ingest] fetching ${adapter.name} (${adapter.key})...`);
    let products;
    try {
      products = await adapter.fetchCatalog();
    } catch (err) {
      console.error(`[ingest] ${adapter.key} failed:`, (err as Error).message);
      summaries.push({ store: adapter.key, fetched: 0, removed: 0 });
      continue;
    }

    for (const p of products) {
      await prisma.product.upsert({
        where: { storeId_externalId: { storeId: store.id, externalId: p.externalId } },
        update: {
          title: p.title,
          price: p.price,
          currency: p.currency ?? "ILS",
          url: p.url,
          imageUrl: p.imageUrl,
          category: p.category,
          inStock: p.inStock ?? true,
        },
        create: {
          storeId: store.id,
          externalId: p.externalId,
          title: p.title,
          price: p.price,
          currency: p.currency ?? "ILS",
          url: p.url,
          imageUrl: p.imageUrl,
          category: p.category,
          inStock: p.inStock ?? true,
        },
      });
    }

    const seenIds = products.map((p) => p.externalId);
    const { count: removed } = await prisma.product.deleteMany({
      where: { storeId: store.id, externalId: { notIn: seenIds } },
    });

    console.log(`[ingest] ${adapter.name}: ${products.length} products (${removed} removed)`);
    summaries.push({ store: adapter.key, fetched: products.length, removed });
  }

  // Cached searches point at the catalog we just replaced -- their prices
  // and matches can be stale (or reference products that no longer exist),
  // so drop them and let the next search resolve against fresh data.
  const { count: staleSearches } = await prisma.searchCache.deleteMany({});
  console.log(`[ingest] cleared ${staleSearches} cached search(es)`);

  return summaries;
}

// CLI entry point: `npm run ingest`
if (require.main === module) {
  runIngest()
    .then((summaries) => {
      console.table(summaries);
      return prisma.$disconnect();
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
