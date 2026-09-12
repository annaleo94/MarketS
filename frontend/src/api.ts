// How an item answers the colour that was asked for. "other" is a known
// colour that isn't it -- shown, but marked and listed after the matches.
export type ColorMatch = "exact" | "pack" | "unknown" | "other";
// Same idea for "עם/בלי רגליות" on overalls and pants -- no "pack" tier,
// a garment either has built-in feet or it doesn't.
export type LegStyleMatch = "exact" | "unknown" | "other";

const COLOR_MATCH_RANK: Record<ColorMatch, number> = { exact: 0, pack: 1, unknown: 2, other: 3 };
const LEG_STYLE_MATCH_RANK: Record<LegStyleMatch, number> = { exact: 0, unknown: 1, other: 2 };

// Combined rank used to find "the best tier actually present" without
// enumerating every (legStyle, color) tier pair by hand -- see Results.tsx.
export function matchRank(i: SearchResultItem): number {
  return LEG_STYLE_MATCH_RANK[i.legStyleMatch ?? "exact"] * 4 + COLOR_MATCH_RANK[i.colorMatch ?? "exact"];
}

export interface SearchResultItem {
  id: string;
  title: string;
  price: number;
  currency: string;
  url: string;
  imageUrl: string | null;
  inStock: boolean;
  sizes: string | null;
  color: string | null;
  // Every colour in the listing -- more than one for a multipack. Optional
  // because a search cached before this field existed won't carry it.
  colors?: string[];
  colorMatch?: ColorMatch;
  legStyle?: string | null;
  legStyleMatch?: LegStyleMatch;
  categorySlug: string | null;
  gender: string;
  score: number;
}

export interface StoreResults {
  store: { key: string; name: string; nameEn: string | null; baseUrl: string; logoUrl: string | null };
  count: number;
  items: SearchResultItem[];
}

export interface AppliedFilter {
  kind: "category" | "size" | "gender" | "color" | "legStyle";
  label: string;
}

export interface SearchResponse {
  query: string;
  normalizedQuery: string;
  fetchedAt: string;
  cached: boolean;
  llmEnabled: boolean;
  filters: AppliedFilter[];
  stores: StoreResults[];
  totalCount: number;
  // Nothing was found in the colour asked for, so what's listed are
  // near-misses. Optional: absent from responses cached by older builds.
  showingAlternatives?: boolean;
}

export async function searchProducts(query: string, dropped: string[] = []): Promise<SearchResponse> {
  const params = new URLSearchParams({ q: query });
  if (dropped.length > 0) params.set("drop", dropped.join(","));

  const res = await fetch(`/api/search?${params}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Search failed (${res.status})`);
  }
  return res.json();
}
