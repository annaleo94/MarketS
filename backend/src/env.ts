import "dotenv/config";

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true" || value === "1";
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  searchCacheTtlMinutes: Number(process.env.SEARCH_CACHE_TTL_MINUTES ?? 30),
  corsOrigin: (process.env.CORS_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  // OpenRouter (https://openrouter.ai) powers free-text product matching.
  // Without a key, search falls back to plain keyword overlap -- still
  // functional, just less forgiving of paraphrasing.
  openRouterApiKey: process.env.OPENROUTER_API_KEY ?? "",
  openRouterModel: process.env.OPENROUTER_MODEL ?? "google/gemini-2.5-flash",
  get llmEnabled() {
    return this.openRouterApiKey.length > 0;
  },

  // Safety cap on catalog ingestion, so a misbehaving store (or a config
  // mistake) can't make `npm run ingest` crawl forever.
  ingestMaxPagesPerSource: Number(process.env.INGEST_MAX_PAGES_PER_SOURCE ?? 2),

  // Products whose colour isn't stated in the title get it read off their
  // photo (see catalog/enrich-colors.ts). Each product is resolved once,
  // but the first run faces the whole catalogue, so cap the calls per run
  // and let successive runs finish the backlog.
  ingestMaxVisionCalls: Number(process.env.INGEST_MAX_VISION_CALLS ?? 600),

  // Optional shared secret for POST /api/admin/ingest. Leave unset for
  // local/dev use.
  adminToken: process.env.ADMIN_TOKEN ?? "",

  // Where the built frontend lives, for serving it alongside the API in
  // production (see index.ts + the root Dockerfile). Doesn't exist in
  // local dev, where the frontend runs its own Vite server instead.
  frontendDistPath: process.env.FRONTEND_DIST_PATH ?? "/app/frontend-dist",
};
