import { prisma } from "../db/prisma";
import { catalogAdapters } from "./registry";
import { CatalogAdapter } from "./types";
import { enrichColors } from "./enrich-colors";
import { enrichLegStyles } from "./enrich-leg-style";
import { enrichCategoriesFromImages } from "./enrich-category";
import { classifyCatalog, genderFromStoreValue } from "./classify";
import { diffProduct, diffDelisted, DetectedEvent, ProductEventKind } from "./history";

export interface IngestSummary {
  store: string;
  fetched: number;
  removed: number; // now "delisted": the row is kept, just marked as gone
  changes: Partial<Record<ProductEventKind, number>>;
}

// A crawl that comes back with a fraction of what the store had last time
// is far more likely to be a broken selector, a rate limit, or a partial
// page than a real clearance. Delisting on that would wipe most of a
// store out of search in one run, so below this share of what we already
// have on file, the delist step is skipped entirely and the run says so.
const MIN_FEED_COMPLETENESS = 0.5;

// How many consecutive syncs may miss a product before it counts as gone.
// Measured, not guessed: two Castro crawls three hours apart returned
// 1,014 and 973 products with no real inventory event between them, so
// one miss is well within normal crawl noise and delisting on it would
// flap ~40 products in and out of search on every run.
const MISSED_SYNCS_BEFORE_DELIST = 3;

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
      summaries.push({ store: adapter.key, fetched: 0, removed: 0, changes: {} });
      continue;
    }

    // Everything we already hold for this store, in one query -- the diff
    // below needs the previous price/stock of every product, and reading
    // them back one at a time would double an already-slow loop.
    const existing = await prisma.product.findMany({
      where: { storeId: store.id },
      select: {
        id: true,
        externalId: true,
        price: true,
        inStock: true,
        listPrice: true,
        lowestPrice: true,
        highestPrice: true,
        delistedAt: true,
        missedSyncs: true,
      },
    });
    const stored = new Map(existing.map((p) => [p.externalId, p]));

    const now = new Date();
    const changes: Partial<Record<ProductEventKind, number>> = {};
    const pendingEvents: { productId: string; event: DetectedEvent }[] = [];
    const record = (productId: string, events: DetectedEvent[]) => {
      for (const event of events) {
        changes[event.kind] = (changes[event.kind] ?? 0) + 1;
        pendingEvents.push({ productId, event });
      }
    };

    for (const p of products) {
      const before = stored.get(p.externalId) ?? null;
      const { events, update } = diffProduct(
        before,
        { price: p.price, inStock: p.inStock ?? true, listPrice: p.listPrice },
        now
      );

      const shared = {
        title: p.title,
        price: p.price,
        currency: p.currency ?? "ILS",
        url: p.url,
        imageUrl: p.imageUrl,
        category: p.category,
        inStock: p.inStock ?? true,
        sizes: p.sizes?.join(",") ?? null,
        storeGender: p.storeGender ?? null,
        missedSyncs: 0, // seen this run, so any earlier misses were crawl noise
        ...update,
      };

      const saved = await prisma.product.upsert({
        where: { storeId_externalId: { storeId: store.id, externalId: p.externalId } },
        update: {
          ...shared,
          ...(genderFromStoreValue(p.storeGender) ? { gender: genderFromStoreValue(p.storeGender)! } : {}),
        },
        create: {
          ...shared,
          storeId: store.id,
          externalId: p.externalId,
          firstSeenAt: now,
          gender: genderFromStoreValue(p.storeGender) ?? "unisex",
        },
        select: { id: true },
      });

      record(saved.id, events);
    }

    // Anything on file the feed no longer lists. Marked, not deleted --
    // deleting would take its price history with it, and then a product
    // that comes back could never be recognised as having come back.
    const seenIds = new Set(products.map((p) => p.externalId));
    const missing = existing.filter((p) => !seenIds.has(p.externalId) && !p.delistedAt);
    const completeness = existing.length > 0 ? products.length / existing.length : 1;

    let delisted = 0;
    if (missing.length > 0 && completeness < MIN_FEED_COMPLETENESS) {
      console.warn(
        `[ingest] ${adapter.key}: feed returned ${products.length} against ${existing.length} on file ` +
          `(${Math.round(completeness * 100)}%) -- skipping the delist step, this looks like a partial crawl, not a clearance`
      );
    } else {
      for (const p of missing) {
        const missedSyncs = p.missedSyncs + 1;
        // Still inside the noise window: count the miss and leave the
        // product listed, so normal crawl jitter doesn't pull real stock
        // out of search and back in again on every run.
        if (missedSyncs < MISSED_SYNCS_BEFORE_DELIST) {
          await prisma.product.update({ where: { id: p.id }, data: { missedSyncs } });
          continue;
        }
        await prisma.product.update({
          where: { id: p.id },
          data: { delistedAt: now, inStock: false, missedSyncs },
        });
        record(p.id, diffDelisted(p));
        delisted += 1;
      }
    }

    if (pendingEvents.length > 0) {
      await prisma.productEvent.createMany({
        data: pendingEvents.map(({ productId, event }) => ({
          productId,
          kind: event.kind,
          oldPrice: event.oldPrice ?? null,
          newPrice: event.newPrice ?? null,
          listPrice: event.listPrice ?? null,
          observedAt: now,
        })),
      });
    }

    const changeSummary = Object.entries(changes)
      .filter(([kind]) => kind !== "listed")
      .map(([kind, n]) => `${n} ${kind}`)
      .join(", ");
    console.log(
      `[ingest] ${adapter.name}: ${products.length} products (${delisted} delisted)` +
        (changeSummary ? ` -- ${changeSummary}` : "")
    );
    summaries.push({ store: adapter.key, fetched: products.length, removed: delisted, changes });
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

  // Category (and gender where it wasn't stated) for anything new -- store
  // data, then a title match, then a cheap text-only LLM guess for whatever
  // neither resolves.
  const classified = await classifyCatalog();
  console.log(
    `[ingest] categories: ${classified.fromStore} from store data, ${classified.fromLlm} classified, ${classified.unresolved} unresolved`
  );

  // A second, per-product look at the photo for whatever the text pass
  // left null or only guessed at with low confidence -- title text alone
  // isn't always enough to name a garment type, but the picture usually is.
  const categoryVision = await enrichCategoriesFromImages();
  console.log(`[ingest] categories from photos: ${categoryVision.resolved} resolved, ${categoryVision.unresolved} still unresolved`);

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
