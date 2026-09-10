import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { env } from "./env";
import { searchRoute } from "./routes/search.route";
import { storesRoute } from "./routes/stores.route";
import { ingestRoute } from "./routes/ingest.route";
import { prisma } from "./db/prisma";
import { runIngest } from "./catalog/ingest";

async function main() {
  const app = express();
  app.use(cors({ origin: env.corsOrigin }));
  app.use(express.json());

  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api", searchRoute);
  app.use("/api", storesRoute);
  app.use("/api", ingestRoute);

  // In production this one container serves both the API and the built
  // frontend (see the root Dockerfile) -- same origin, no CORS needed for
  // the app itself. In local dev the frontend runs its own Vite server
  // instead, so this directory won't exist and is simply skipped.
  if (fs.existsSync(env.frontendDistPath)) {
    app.use(express.static(env.frontendDistPath));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(env.frontendDistPath, "index.html"));
    });
  }

  app.listen(env.port, () => {
    console.log(`[boot] MarketS API listening on http://localhost:${env.port}`);
    console.log(`[boot] LLM matching: ${env.llmEnabled ? `on (${env.openRouterModel})` : "off (keyword fallback)"}`);
  });

  // A cached row holds a whole serialised response, so any build that
  // changes how results are shaped, ranked or filtered would go on serving
  // the previous build's answers until the TTL ran out. Twice now that has
  // meant a fix looking like it hadn't worked -- once for a field the old
  // rows didn't carry, once for a size rule the old rows predated. Relying
  // on remembering to bump a version constant is what failed both times;
  // a deploy restarts the process, so clearing here is automatic.
  const { count: dropped } = await prisma.searchCache.deleteMany({});
  if (dropped > 0) console.log(`[boot] cleared ${dropped} cached search(es) from the previous build`);

  const productCount = await prisma.product.count();
  if (productCount === 0) {
    console.log("[boot] catalog is empty, running initial ingest in the background (or run `npm run ingest` yourself)...");
    runIngest().catch((err) => console.error("[boot] initial ingest failed:", err));
  }
}

main().catch((err) => {
  console.error("[boot] fatal:", err);
  process.exit(1);
});
