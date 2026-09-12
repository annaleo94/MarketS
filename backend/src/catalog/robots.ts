import axios from "axios";

export const SCRAPER_USER_AGENT =
  "MarketS-PriceBot/0.1 (+baby/kids clothing price-comparison pilot; contact: repo issues)";

interface RobotsDirective {
  allow: boolean;
  pattern: string; // as written in robots.txt, e.g. "/*?" or "/checkout/"
  matcher: RegExp;
}

export interface RobotsRule {
  directives: RobotsDirective[];
}

const robotsCache = new Map<string, RobotsRule>();

// Best-effort robots.txt check for our user-agent (falling back to "*").
// Fails open (returns true = allowed) if robots.txt can't be fetched or
// parsed -- this is a courtesy check, not a legal opinion. We only ever
// hit endpoints each store's own front-end already calls publicly
// (Shopify's /products.json, a store's own category pages) and cache
// aggressively (see ingest.ts), but always confirm a site's Terms of
// Service too before crawling it in production.
export async function isAllowedByRobots(targetUrl: string): Promise<boolean> {
  const url = new URL(targetUrl);
  const origin = url.origin;

  let rules = robotsCache.get(origin);
  if (!rules) {
    rules = await fetchRobotsRules(origin);
    robotsCache.set(origin, rules);
  }

  return isAllowedByRules(rules, targetUrl);
}

// The rule-matching half, split out from the fetching half so the
// committed regression suite can pin this behaviour against each store's
// real robots.txt text without touching the network.
export function isAllowedByRules(rules: RobotsRule, targetUrl: string): boolean {
  const url = new URL(targetUrl);

  // The query string is part of what a rule matches against, not just the
  // path: Papaya disallows `/*?` -- every URL carrying a query at all --
  // which is precisely how its category pagination (`?p=2`) is addressed.
  const target = `${url.pathname}${url.search}`;

  // Longest matching pattern wins, and Allow beats Disallow at equal
  // length -- the standard precedence rule. Without it, Shopify's broad
  // `Disallow: /*/account` would bury the narrower `Allow:` lines its own
  // robots.txt pairs with it.
  let verdict: RobotsDirective | null = null;
  for (const directive of rules.directives) {
    if (!directive.matcher.test(target)) continue;
    if (
      verdict === null ||
      directive.pattern.length > verdict.pattern.length ||
      (directive.pattern.length === verdict.pattern.length && directive.allow)
    ) {
      verdict = directive;
    }
  }

  return verdict === null || verdict.allow;
}

// robots.txt patterns are prefix matches with two wildcards: `*` stands
// for any run of characters and a trailing `$` anchors the end of the URL.
// These are load-bearing here, not decoration -- every rule in the three
// Shopify stores' robots.txt starts with one, and a plain
// `startsWith(pattern)` check (what this used to do) matched none of them,
// so the file was being read and then effectively ignored.
function patternToRegExp(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = body.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}${anchored ? "$" : ""}`);
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
    return { directives: [] }; // no robots.txt / unreachable -> fail open
  }
}

export function parseRobotsTxt(text: string): RobotsRule {
  const lines = text.split("\n").map((l) => l.trim());
  const directives: RobotsDirective[] = [];
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
    } else if ((key === "disallow" || key === "allow") && inRelevantGroup) {
      // An empty Disallow means "nothing is disallowed" -- it's how a
      // robots.txt opens a site up, so it must not become a rule that
      // matches everything.
      if (value === "") continue;
      directives.push({ allow: key === "allow", pattern: value, matcher: patternToRegExp(value) });
    }
  }
  return { directives };
}
