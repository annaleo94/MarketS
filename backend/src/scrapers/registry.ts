import { StoreAdapter } from "./types";
import { mockStoreAdapters } from "./adapters/mock-stores";
import { createJsonLdAdapter } from "./adapters/live/generic-jsonld.adapter";
import { liveSiteConfigs } from "./adapters/live/sites";
import { env } from "../env";

// All stores MarketS will search, in one place. Mock stores are always on
// (they're what make the app work with zero setup); live stores only run
// when explicitly enabled, since they hit real third-party sites.
//
// Every entry in `liveSiteConfigs` is wired through the JSON-LD adapter by
// default -- it's safe to attempt against any site (it just returns
// nothing if the site has no Product structured data). If you've verified
// CSS selectors for a store instead, swap in `createCssAdapter(config)`
// for that one entry -- see ./adapters/live/README.md.
export function getActiveAdapters(): StoreAdapter[] {
  const adapters: StoreAdapter[] = [...mockStoreAdapters];

  if (env.enableLiveScrapers) {
    if (liveSiteConfigs.length === 0) {
      console.warn(
        "[scrapers] ENABLE_LIVE_SCRAPERS=true but backend/src/scrapers/adapters/live/sites.ts has no stores configured yet."
      );
    }
    adapters.push(...liveSiteConfigs.map(createJsonLdAdapter));
  }

  return adapters;
}
