import express from "express";
import cors from "cors";
import { env } from "./env";
import { searchRoute } from "./routes/search.route";
import { storesRoute } from "./routes/stores.route";
import { getActiveAdapters } from "./scrapers/registry";
import { syncStores } from "./db/sync-stores";

async function main() {
  const adapters = getActiveAdapters();
  await syncStores(adapters);
  console.log(
    `[boot] ${adapters.length} store(s) active (${adapters.filter((a) => a.isLive).length} live, ${adapters.filter((a) => !a.isLive).length} demo)`
  );

  const app = express();
  app.use(cors({ origin: env.corsOrigin }));
  app.use(express.json());

  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api", searchRoute);
  app.use("/api", storesRoute);

  app.listen(env.port, () => {
    console.log(`[boot] MarketS API listening on http://localhost:${env.port}`);
  });
}

main().catch((err) => {
  console.error("[boot] fatal:", err);
  process.exit(1);
});
