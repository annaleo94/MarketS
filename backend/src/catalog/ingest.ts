import { prisma } from "../db/prisma";
import { catalogAdapters } from "./registry";
import { CatalogAdapter } from "./types";
import { enrichColors } from "./enrich-colors";
import { enrichLegStyles } from "./enrich-leg-style";
import { classifyCatalog, genderFromStoreValue } from "./classify";

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
          sizes: p.sizes?.join(",") ?? null,
          storeGender: p.storeGender ?? null,
          ...(genderFromStoreValue(p.storeGender) ? { gender: genderFromStoreValue(p.storeGender)! } : {}),
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
          sizes: p.sizes?.join(",") ?? null,
          storeGender: p.storeGender ?? null,
          gender: genderFromStoreValue(p.storeGender) ?? "unisex",
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

  // A store dropped from the registry (an adapter removed, or reverted
  // out, as TerminalX was) otherwise leaves its products behind forever:
  // the loop above only touches adapters that are still configured, so
  // nothing ever prunes the old ones. Delete products first -- Product has
  // no cascade on its Store foreign key -- then the store row itself, so a
  // removed store's data doesn't linger and its old totalCount doesn't
  // keep counting toward search results after it's gone.
  const activeKeys = adapters.map((a) => a.key);
  const orphanedStores = await prisma.store.findMany({ where: { key: { notIn: activeKeys } } });
  for (const store of orphanedStores) {
    const { count: deletedProducts } = await prisma.product.deleteMany({ where: { storeId: store.id } });
    await prisma.store.delete({ where: { id: store.id } });
    console.log(`[ingest] removed store ${store.key} (no longer configured): ${deletedProducts} products deleted`);
  }

  // Category (and gender where it wasn't stated) for anything new.
  const classified = await classifyCatalog();
  console.log(
    `[ingest] categories: ${classified.fromStore} from store data, ${classified.fromLlm} classified, ${classified.unresolved} unresolved`
  );

  // Resolve colours for anything newly added. Existing products keep the
  // colour they already have (the upsert above deliberately leaves the
  // field alone), so this only pays for what's actually new.
  const colors = await enrichColors();
  console.log(
    `[ingest] colours: ${colors.fromTitle} from titles, ${colors.fromVision} from photos, ${colors.unresolved} still pending`
  );

  // Whether overalls/pants have built-in feet or not -- runs after
  // classifyCatalog() since it only looks at products already categorised
  // into the overall/pants family.
  const legStyles = await enrichLegStyles();
  console.log(
    `[ingest] leg style: ${legStyles.fromTitle} from titles, ${legStyles.fromVision} from photos, ${legStyles.unresolved} still pending`
  );

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
