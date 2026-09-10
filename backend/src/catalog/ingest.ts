import { prisma } from "../db/prisma";
import { catalogAdapters } from "./registry";
import { CatalogAdapter } from "./types";
import { enrichColors } from "./enrich-colors";
import { classifyCatalog, genderFromStoreValue } from "./classify";
import { normalizeColorName } from "./colors";

// Keeps only the colours that map onto our vocabulary. Marketplace listings
// carry plenty that don't -- supplier codes like "SUMMIT WHI" or
// "OFF NOIR/B" on footwear, or "מולטי" for a print -- and those are left
// unresolved so the photo pass can have a go instead of us storing a colour
// name no shopper would ever search for.
function statedColors(raw: string[] | undefined): string[] | null {
  if (!raw || raw.length === 0) return null;
  const mapped = [...new Set(raw.map(normalizeColorName).filter((c): c is string => !!c))];
  return mapped.length > 0 ? mapped : null;
}

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
      // A colour the store states itself beats anything we could infer, and
      // costs nothing -- so it is written on every run, and the product then
      // skips colour enrichment entirely.
      const stated = statedColors(p.colors);
      const colorFields = stated
        ? { color: stated[0], colors: stated.join(","), colorSource: "store", colorIsSolid: stated.length === 1 }
        : {};

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
          ...colorFields,
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
          ...colorFields,
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
