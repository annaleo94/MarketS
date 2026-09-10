import "dotenv/config";

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true" || value === "1";
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  searchCacheTtlMinutes: Number(process.env.SEARCH_CACHE_TTL_MINUTES ?? 30),
  enableLiveScrapers: bool(process.env.ENABLE_LIVE_SCRAPERS, false),
  corsOrigin: (process.env.CORS_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};
