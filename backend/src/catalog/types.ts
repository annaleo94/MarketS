// One product as ingested from a store's site.
export interface CatalogProduct {
  externalId: string; // the store's own product id/handle -- used to dedupe on re-ingest
  title: string;
  price: number;
  currency?: string; // defaults to ILS
  url: string;
  imageUrl?: string;
  category?: string;
  inStock?: boolean;
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
