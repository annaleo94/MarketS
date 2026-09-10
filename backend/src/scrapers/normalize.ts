// Text normalization + a lightweight relevance score used to (a) dedupe
// cache keys and (b) rank/filter each store's own search results against
// the user's query, since we don't do cross-store product-entity matching
// (see README "How matching works").

const HEBREW_NIQQUD = /[֑-ׇ]/g; // vowel points / cantillation marks
const PUNCTUATION = /["'`.,;:!?()\[\]{}\-_/\\|]/g;

export function normalizeQuery(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(HEBREW_NIQQUD, "")
    .replace(PUNCTUATION, " ")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function tokenize(text: string): string[] {
  return normalizeQuery(text)
    .split(" ")
    .filter((t) => t.length > 0);
}

// 0..1 relevance score of `title` against `query`: token overlap (recall of
// the query's tokens inside the title), with a bonus if the whole
// normalized query appears as a substring.
export function relevanceScore(query: string, title: string): number {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return 0;
  const titleTokens = new Set(tokenize(title));

  let hits = 0;
  for (const t of queryTokens) {
    if (titleTokens.has(t)) hits += 1;
    else if ([...titleTokens].some((tt) => tt.includes(t) || t.includes(tt))) hits += 0.5;
  }
  let score = hits / queryTokens.length;

  if (normalizeQuery(title).includes(normalizeQuery(query))) {
    score = Math.min(1, score + 0.25);
  }
  return Math.max(0, Math.min(1, score));
}
