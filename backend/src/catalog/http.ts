import axios from "axios";
import { isAllowedByRobots, SCRAPER_USER_AGENT } from "./robots";

// Fetches `url` as text, after checking robots.txt. Returns null (never
// throws) when disallowed or the request fails -- callers should treat
// that as "this source returned nothing" and move on.
export async function fetchText(url: string, timeoutMs = 15000): Promise<string | null> {
  try {
    if (!(await isAllowedByRobots(url))) {
      console.warn(`[catalog] robots.txt disallows ${url}, skipping`);
      return null;
    }
    const { data } = await axios.get<string>(url, {
      headers: { "User-Agent": SCRAPER_USER_AGENT, Accept: "text/html,application/json" },
      timeout: timeoutMs,
      validateStatus: (s) => s >= 200 && s < 300,
      // Keep the body as a raw string even when the server sends
      // application/json -- axios otherwise auto-parses it, which breaks
      // fetchJson's own JSON.parse below.
      responseType: "text",
      transformResponse: (raw) => raw,
    });
    return data;
  } catch (err) {
    console.warn(`[catalog] fetch failed for ${url}:`, (err as Error).message);
    return null;
  }
}

export async function fetchJson<T>(url: string, timeoutMs = 15000): Promise<T | null> {
  const raw = await fetchText(url, timeoutMs);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    console.warn(`[catalog] non-JSON response from ${url}`);
    return null;
  }
}
