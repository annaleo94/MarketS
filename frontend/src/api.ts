export interface SearchResultItem {
  store: {
    key: string;
    name: string;
    baseUrl: string;
    logoUrl: string | null;
    isLive: boolean;
  };
  title: string;
  price: number;
  currency: string;
  url: string;
  imageUrl: string | null;
  inStock: boolean;
  matchReason: string;
  isExact: boolean;
  sizes: string | null;
}

export interface SearchResponse {
  query: string;
  normalizedQuery: string;
  fetchedAt: string;
  cached: boolean;
  llmEnabled: boolean;
  results: SearchResultItem[];
}

export async function searchProducts(query: string): Promise<SearchResponse> {
  const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Search failed (${res.status})`);
  }
  return res.json();
}
