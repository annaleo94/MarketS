import axios from "axios";
import { isAllowedByRobots, SCRAPER_USER_AGENT } from "./robots";

// Fetches `url` as text, after checking robots.txt. Returns null (never
// throws) when disallowed, blocked, or the request fails -- callers should
// treat that as "this store returned zero results" and move on, since one
// slow/broken store must never take the whole search down.
export async function fetchHtml(url: string, timeoutMs = 8000): Promise<string | null> {
  try {
    if (!(await isAllowedByRobots(url))) {
      console.warn(`[scraper] robots.txt disallows ${url}, skipping`);
      return null;
    }
    const { data } = await axios.get<string>(url, {
      headers: {
        "User-Agent": SCRAPER_USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
      timeout: timeoutMs,
      validateStatus: (s) => s >= 200 && s < 300,
    });
    return data;
  } catch (err) {
    console.warn(`[scraper] fetch failed for ${url}:`, (err as Error).message);
    return null;
  }
}
