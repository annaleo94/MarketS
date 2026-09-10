import axios from "axios";

export const SCRAPER_USER_AGENT =
  "MarketS-PriceBot/0.1 (+price comparison research; contact: repo issues)";

interface RobotsRule {
  disallow: string[];
}

const robotsCache = new Map<string, RobotsRule>();

// Best-effort robots.txt check for our user-agent (falling back to "*").
// Fails open (returns true = allowed) if robots.txt can't be fetched or
// parsed -- this is a courtesy check, not a legal opinion. Always confirm
// a site's actual Terms of Service before scraping it in production; see
// backend/src/scrapers/adapters/live/README.md.
export async function isAllowedByRobots(targetUrl: string): Promise<boolean> {
  const url = new URL(targetUrl);
  const origin = url.origin;

  let rules = robotsCache.get(origin);
  if (!rules) {
    rules = await fetchRobotsRules(origin);
    robotsCache.set(origin, rules);
  }

  return !rules.disallow.some((prefix) => prefix !== "" && url.pathname.startsWith(prefix));
}

async function fetchRobotsRules(origin: string): Promise<RobotsRule> {
  try {
    const { data } = await axios.get<string>(`${origin}/robots.txt`, {
      headers: { "User-Agent": SCRAPER_USER_AGENT },
      timeout: 5000,
      validateStatus: (s) => s === 200,
    });
    return parseRobotsTxt(data);
  } catch {
    return { disallow: [] }; // no robots.txt / unreachable -> fail open
  }
}

function parseRobotsTxt(text: string): RobotsRule {
  const lines = text.split("\n").map((l) => l.trim());
  const disallow: string[] = [];
  let inRelevantGroup = false;
  let sawSpecificAgent = false;

  for (const line of lines) {
    const [rawKey, ...rest] = line.split(":");
    if (!rawKey || rest.length === 0) continue;
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();

    if (key === "user-agent") {
      const agent = value.toLowerCase();
      if (agent === "marketspricebot" || agent.includes("marketsbot")) {
        inRelevantGroup = true;
        sawSpecificAgent = true;
      } else if (agent === "*" && !sawSpecificAgent) {
        inRelevantGroup = true;
      } else {
        inRelevantGroup = false;
      }
    } else if (key === "disallow" && inRelevantGroup) {
      disallow.push(value);
    }
  }
  return { disallow };
}
