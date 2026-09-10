# Onboarding a real store

MarketS ships with three demo stores (`../mock-stores.ts`) so the app is
fully usable out of the box. Turning on real scraping against a live store
is a separate, deliberate step -- do this per store:

## 1. Check you're allowed to

- Read the store's Terms of Service for a scraping/automated-access clause.
- Check `https://<site>/robots.txt`. `isAllowedByRobots()` in `./robots.ts`
  does this automatically at request time as a courtesy check, but it's
  best-effort text parsing, not a legal opinion -- read it yourself too.
- Prefer an official API or affiliate product feed if the retailer offers
  one; it's more stable and unambiguously permitted. Scraping is the
  fallback, not the default.
- Keep request volume low (this project makes one request per unique
  search, cached for `SEARCH_CACHE_TTL_MINUTES`) and set a real, honest
  `User-Agent` (see `SCRAPER_USER_AGENT` in `./robots.ts`) so the site
  operator can identify and contact you.

## 2. Find the search URL

Open the store's site, use its search box, and copy the resulting URL.
Most sites take the query as a `?q=` / `?s=` / `?search=` parameter --
confirm which, in a real browser, then write a `buildSearchUrl(query)`
function for it.

## 3. Try the JSON-LD adapter first

`createJsonLdAdapter()` (`./generic-jsonld.adapter.ts`) needs zero
per-site selectors: it reads the store's own `<script
type="application/ld+json">` `Product` structured data, which most modern
storefronts (Shopify, WooCommerce, Magento, many Israeli platforms)
already emit for SEO. To check if a store has it:

```
curl -A "MarketS-PriceBot/0.1" "https://www.example.co.il/search?q=iphone" | grep -o 'application/ld+json'
```

If that finds matches, add the store to `./sites.ts` with just `key`,
`name`, `baseUrl`, `buildSearchUrl` -- no `css` needed.

## 4. Otherwise, fill in CSS selectors

Open the search-results page in a real browser, use devtools "inspect
element" on one product card, and find:

- a container selector that matches *every* product card (`item`)
- inside it, the title text, the price text, the `<a>` link, and
  (optionally) the `<img>`
- Then fill in `config.css` in `./sites.ts` and register the store with
  `createCssAdapter()` instead of `createJsonLdAdapter()`.

CSS selectors *will* break when the store redesigns its site -- that's the
tradeoff for not depending on structured data. Re-verify periodically.

## 5. Test in isolation before wiring it in

```ts
import { createJsonLdAdapter } from "./generic-jsonld.adapter";
const adapter = createJsonLdAdapter({ key: "example", name: "Example", baseUrl: "...", buildSearchUrl: (q) => `...${q}` });
adapter.search("iphone 15").then(console.log);
```

Once it returns sane results, add the config to `./sites.ts` and set
`ENABLE_LIVE_SCRAPERS=true` in `.env`.

## Sites JS-rendering requires a real browser

Some storefronts render their product grid client-side and return an empty
shell to a plain HTTP GET. `axios`-based fetching (what both generic
adapters use) won't see that content. `playwright` is already a backend
dependency for exactly this case -- write a third adapter that launches a
headless browser, waits for the product grid selector, then extracts the
same way `generic-css.adapter.ts` does from `page.content()`. It's slower
and heavier, so reserve it for stores that actually need it.
