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
  // mistake) can't make `npm run ingest` crawl forever. Not a target to
  // tune down to "what we currently need": the previous value of 2 was
  // silently dropping most of the catalogue on the two largest stores --
  // Shilav's single collection is 6 pages deep (1,424 products; only 500
  // were ever ingested), Fox's two are 4 pages each (1,766 real vs 1,000
  // ingested) -- discovered only because a shopper searched for a product
  // that happened to live entirely past page 2. Each crawl loop still
  // stops itself the moment a page comes back empty, so this only bounds
  // the pathological case (a source that never terminates); it should
  // stay comfortably above any real catalogue this pilot's stores are
  // likely to reach, not just today's.
  ingestMaxPagesPerSource: Number(process.env.INGEST_MAX_PAGES_PER_SOURCE ?? 40),

  // Products whose colour isn't stated in the title get it read off their
  // photo (see catalog/enrich-colors.ts). Each product is resolved once,
  // but the first run faces the whole catalogue, so cap the calls per run
  // and let successive runs finish the backlog.
  ingestMaxVisionCalls: Number(process.env.INGEST_MAX_VISION_CALLS ?? 600),

  // How often the catalog re-syncs itself, in hours. 0 disables the
  // scheduler entirely (useful locally, where crawling four real stores
  // on a timer isn't wanted).
  //
  // Six hours is measured, not guessed: comparing every stored price
  // against a fresh crawl of all four stores three hours apart found
  // zero price changes and zero stock changes across 3,529 products, so
  // intraday churn is low and hourly syncing would be pure waste. Four
  // runs a day still catches an overnight promo rollover the same
  // morning. SyncRun now records how much each run actually found, so
  // this number can be re-derived from our own data rather than re-argued.
  syncIntervalHours: Number(process.env.SYNC_INTERVAL_HOURS ?? 6),

  // Relevance floor applied after ranking. Deliberately configurable:
  // it gets tuned against real results, and there is no minimum quota --
  // if three products clear it, three are shown.
  searchMinScore: Number(process.env.SEARCH_MIN_SCORE ?? 0.4),

  // Optional shared secret for POST /api/admin/ingest. Leave unset for
  // local/dev use.
  adminToken: process.env.ADMIN_TOKEN ?? "",

  // Where the built frontend lives, for serving it alongside the API in
  // production (see index.ts + the root Dockerfile). Doesn't exist in
  // local dev, where the frontend runs its own Vite server instead.
  frontendDistPath: process.env.FRONTEND_DIST_PATH ?? "/app/frontend-dist",
};
