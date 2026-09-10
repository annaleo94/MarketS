import { Router } from "express";
import { runIngest } from "../catalog/ingest";
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
  ingestInProgress = true;
  runIngest()
    .then((summaries) => console.log("[ingest] finished:", JSON.stringify(summaries)))
    .catch((err) => console.error("[/api/admin/ingest] failed:", err))
    .finally(() => {
      ingestInProgress = false;
    });

  res.status(202).json({ started: true });
});
