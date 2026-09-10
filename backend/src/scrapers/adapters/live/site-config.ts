export interface LiveSiteConfig {
  key: string;
  name: string;
  baseUrl: string;
  logoUrl?: string;
  buildSearchUrl(query: string): string;
  // Only used by the CSS adapter (generic-css.adapter.ts). Every field is a
  // CSS selector *relative to* `item`. `price` may match text like
  // "₪1,299.90" -- price-parse.ts handles the cleanup.
  css?: {
    item: string;
    title: string;
    price: string;
    link: string;
    image?: string;
  };
  // Cap on how many matches to keep per search (after relevance filtering).
  maxResults?: number;
}
