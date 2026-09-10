import { Router } from "express";
import { runIngest } from "../catalog/ingest";
import { env } from "../env";

export const ingestRoute = Router();

// Manually re-crawl all stores' catalogs. Same thing `npm run ingest` does,
// exposed over HTTP for convenience (e.g. wiring to a cron service).
// Protected by ADMIN_TOKEN when that env var is set; open in local/dev
// when it isn't.
ingestRoute.post("/admin/ingest", async (req, res) => {
  if (env.adminToken && req.header("X-Admin-Token") !== env.adminToken) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const summaries = await runIngest();
    res.json({ summaries });
  } catch (err) {
    console.error("[/api/admin/ingest] failed:", err);
    res.status(500).json({ error: "Ingest failed" });
  }
});
