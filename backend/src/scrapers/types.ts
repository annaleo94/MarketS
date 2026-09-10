// One product offer found on a store's site for a given search query.
export interface StoreListingResult {
  title: string;
  price: number;
  currency?: string; // defaults to ILS
  url: string;
  imageUrl?: string;
  inStock?: boolean;
}

// Every store integration -- mock or live -- implements this. The search
// service doesn't care which kind it's talking to.
export interface StoreAdapter {
  key: string; // stable id, also used as Store.key in the DB
  name: string; // display name
  baseUrl: string;
  logoUrl?: string;
  isLive: boolean; // true = scrapes a real site, false = demo data
  search(query: string): Promise<StoreListingResult[]>;
}
