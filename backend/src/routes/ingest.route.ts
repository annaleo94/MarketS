import { Router } from "express";
import { runSync } from "../catalog/scheduler";
import { prisma } from "../db/prisma";
import { env } from "../env";

export const ingestRoute = Router();

// What the sync has actually been doing: the last runs, and the most
// recent price/stock movements across the catalog. Answers "is the
// scheduler alive and is it finding anything" from data rather than from
// container logs, and is the read side of the history the sync records.
ingestRoute.get("/admin/sync-status", async (req, res) => {
  if (env.adminToken && req.header("X-Admin-Token") !== env.adminToken) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [runs, recentEvents, eventTotals] = await Promise.all([
    prisma.syncRun.findMany({ orderBy: { startedAt: "desc" }, take: 10 }),
    prisma.productEvent.findMany({
      where: { kind: { not: "listed" } },
      orderBy: { observedAt: "desc" },
      take: 25,
      include: { product: { select: { title: true, url: true, store: { select: { name: true } } } } },
    }),
    prisma.productEvent.groupBy({ by: ["kind"], _count: { kind: true } }),
  ]);

  res.json({
    intervalHours: env.syncIntervalHours,
    runs: runs.map((r) => ({
      trigger: r.trigger,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      minutes: r.finishedAt ? +((r.finishedAt.getTime() - r.startedAt.getTime()) / 60000).toFixed(1) : null,
      newProducts: r.newProducts,
      priceDrops: r.priceDrops,
      priceRises: r.priceRises,
      backInStock: r.backInStock,
      outOfStock: r.outOfStock,
      delisted: r.delisted,
      relisted: r.relisted,
      error: r.error,
    })),
    eventTotals: Object.fromEntries(eventTotals.map((e) => [e.kind, e._count.kind])),
    recentEvents: recentEvents.map((e) => ({
      kind: e.kind,
      store: e.product.store.name,
      title: e.product.title,
      oldPrice: e.oldPrice,
      newPrice: e.newPrice,
      listPrice: e.listPrice,
      observedAt: e.observedAt,
      url: e.product.url,
    })),
  });
});

let ingestInProgress = false;

// Manually re-crawl all stores' catalogs. Same thing `npm run ingest` does,
// exposed over HTTP for convenience (e.g. wiring to a cron service).
// Protected by ADMIN_TOKEN when that env var is set; open in local/dev
// when it isn't.
ingestRoute.post("/admin/ingest", async (req, res) => {
  if (env.adminToken && req.header("X-Admin-Token") !== env.adminToken) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (ingestInProgress) {
    res.status(409).json({ error: "An ingest is already running" });
    return;
  }

  // Crawling three catalogues and resolving colours from product photos
  // runs well past the proxy's request timeout, so the job is started and
  // acknowledged rather than awaited -- the caller would only ever see a
  // disconnect. Progress goes to the app log; /api/stores shows the result.
  // ?recolor=1 discards colours previously read from photos so they're
  // resolved again -- for when the detection itself has been improved and
  // the stored values are known to be wrong. Colours the store stated in
  // its own title are left alone.
  const recolor = req.query.recolor === "1";

  // ?reclassify=1 does the same for category: classifyCatalog() only ever
  // looks at products with categorySlug still null, so a belt that was
  // already (wrongly) tagged "bottoms" before a taxonomy fix stays wrong
  // forever otherwise -- it's never null again to be picked back up.
  // Unlike colour, category has no per-product record of which method set
  // it, so this clears every product's category rather than a specific
  // subset; re-deriving it is free for the large majority that resolve
  // from store data or title text, and only the leftover minority costs an
  // LLM call, same as any other ingest.
  const reclassify = req.query.reclassify === "1";

  // ?releg=1 mirrors ?recolor=1 for Product.legStyle: clears whatever was
  // previously detected (title or vision, including "none") so an improved
  // detector -- or a taxonomy change to LEG_STYLE_CATEGORIES -- can revisit
  // it. Not folded into ?reclassify=1: category and leg style are derived
  // independently and can each be wrong without the other being wrong.
  const releg = req.query.releg === "1";

  ingestInProgress = true;
  Promise.resolve()
    .then(async () => {
      if (recolor) {
        // "none" is included: those are the ones a previous detector gave
        // up on, so they are exactly what an improved one needs to revisit.
        const { count } = await prisma.product.updateMany({
          where: { colorSource: { in: ["vision", "none"] } },
          data: { color: null, colors: null, colorSource: null, colorIsSolid: null },
        });
        console.log(`[ingest] cleared ${count} photo-derived colour(s) for re-detection`);
      }
      if (releg) {
        const { count } = await prisma.product.updateMany({
          where: { legStyleSource: { in: ["title", "vision", "none"] } },
          data: { legStyle: null, legStyleSource: null },
        });
        console.log(`[ingest] cleared ${count} leg style value(s) for re-detection`);
      }
      if (reclassify) {
        // categorySource/categoryConfidence have to go too, not just the
        // slug -- enrich-category.ts's vision follow-up decides whether a
        // row still needs a look by checking categorySource, so a stale
        // value surviving the reset would leave it permanently invisible
        // to every stage of the pipeline (classifyCatalog only requeues on
        // categorySlug being null, which this does clear, but a row that
        // then fails to resolve there again would silently fall through
        // enrichCategoriesFromImages' own query too).
        const { count } = await prisma.product.updateMany({
          where: { categorySlug: { not: null } },
          data: { categorySlug: null, categorySource: null, categoryConfidence: null },
        });
        console.log(`[ingest] cleared ${count} categor${count === 1 ? "y" : "ies"} for reclassification`);
      }
    })
    // Booked as a SyncRun like a scheduled run, so a manual sync counts
    // toward "when did we last sync" and the scheduler doesn't fire again
    // right on top of one someone just triggered by hand.
    .then(() => runSync("manual"))
    .catch((err) => console.error("[/api/admin/ingest] failed:", err))
    .finally(() => {
      ingestInProgress = false;
    });

  res.status(202).json({ started: true });
});
