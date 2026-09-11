// One product as ingested from a store's site.
export interface CatalogProduct {
  externalId: string; // the store's own product id/handle -- used to dedupe on re-ingest
  title: string;
  price: number;
  // The store's own "before" price, where it publishes one (Shopify's
  // compare_at_price, Magento's oldPrice). Only meaningful when it's
  // above `price`; catalog/history.ts is what decides that, so adapters
  // can pass whatever the store gave them through untouched.
  listPrice?: number;
  currency?: string; // defaults to ILS
  url: string;
  imageUrl?: string;
  category?: string;
  inStock?: boolean;
  sizes?: string[];
  storeGender?: string; // raw gender text from the store, if it states one
}

// A store integration for the catalog pilot. Unlike a "search this store"
// adapter, this fetches the store's *entire* baby/kids-clothing catalog
// once (see ./ingest.ts) -- search then runs against our own indexed copy
// instead of hitting the store on every request.
export interface CatalogAdapter {
  key: string; // stable id, also used as Store.key in the DB
  name: string;
  baseUrl: string;
  logoUrl?: string;
  fetchCatalog(): Promise<CatalogProduct[]>;
}
