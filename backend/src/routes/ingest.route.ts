import { Router } from "express";
import { runIngest } from "../catalog/ingest";
import { prisma } from "../db/prisma";
import { env } from "../env";

export const ingestRoute = Router();

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
      if (reclassify) {
        const { count } = await prisma.product.updateMany({
          where: { categorySlug: { not: null } },
          data: { categorySlug: null },
        });
        console.log(`[ingest] cleared ${count} categor${count === 1 ? "y" : "ies"} for reclassification`);
      }
    })
    .then(() => runIngest())
    .then((summaries) => console.log("[ingest] finished:", JSON.stringify(summaries)))
    .catch((err) => console.error("[/api/admin/ingest] failed:", err))
    .finally(() => {
      ingestInProgress = false;
    });

  res.status(202).json({ started: true });
});
