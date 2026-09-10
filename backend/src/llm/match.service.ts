import { completeJson } from "./openrouter.client";
import { relevanceScore } from "../scrapers/normalize";
import { colorFromTitle } from "../catalog/colors";
import { env } from "../env";

// Shape-compatible with Prisma's Product model, without importing the
// generated client type here (keeps this module easy to unit test).
export interface CatalogEntry {
  id: string;
  title: string;
  price: number;
  currency: string;
  url: string;
  imageUrl: string | null;
  inStock: boolean;
  color: string | null;
  colorIsSolid: boolean | null;
}

export interface MatchResult {
  product: CatalogEntry;
  reason: string;
  // false when the store had nothing of the requested kind and this is the
  // nearest thing instead (a white bodysuit for "white shirt"). Shown to
  // the shopper rather than quietly passed off as what they asked for.
  isExact: boolean;
}

const KEYWORD_MATCH_THRESHOLD = 0.35;

// How many candidates per store get sent to the LLM for final selection.
// A whole store catalog (1000+ items) is ~28k tokens per request, which is
// both wasteful and larger than some accounts' per-request token ceiling.
// ~120 titles is a few thousand tokens and still gives the model far more
// to choose from than it realistically needs.
const SHORTLIST_SIZE = 120;

// Turns the shopper's free-text description into words that would plausibly
// appear in a product *title*, so the lexical shortlist below can find
// candidates even when the description shares no words with the listing
// ("something warm for winter" -> סריג, קרדיגן, פליז...). One small call,
// reused for every store.
export async function expandQueryKeywords(rawQuery: string): Promise<string[]> {
  if (!env.llmEnabled) return [];

  const response = await completeJson<{ keywords?: string[] }>([
    {
      role: "system",
      content:
        "אתה עוזר לחיפוש מוצרים בקטלוג בגדי תינוקות וילדים. קבל תיאור חופשי של הלקוח והחזר מילות מפתח שסביר " +
        "שיופיעו בכותרת של מוצר מתאים בחנות: סוגי הפריט עצמו ומילים נרדפות שלו (למשל 'משהו חם' -> סריג, קרדיגן, " +
        "פליז, מעיל, חליפה), חומרים, וסגנון. אל תכלול מילים כלליות כמו 'משהו', 'נוח', 'יפה', ואל תכלול גיל. " +
        'ענה אך ורק ב-JSON: {"keywords": ["...", "..."]} -- עד 12 מילים, בעברית.',
    },
    { role: "user", content: rawQuery },
  ]);

  return Array.isArray(response?.keywords) ? response.keywords.filter((k) => typeof k === "string") : [];
}

// Finds the single best-matching product for a free-text query within one
// store's catalog. Tries the LLM first (understands paraphrasing,
// synonyms, "something warm for a 3-month-old" style descriptions);
// falls back to keyword overlap if no API key is configured or the LLM
// call fails, so search still works either way.
export async function matchInStore(
  rawQuery: string,
  products: CatalogEntry[],
  expandedKeywords: string[] = []
): Promise<MatchResult | null> {
  if (products.length === 0) return null;

  if (env.llmEnabled) {
    const candidates = shortlist(rawQuery, expandedKeywords, products, SHORTLIST_SIZE);
    const llmResult = await matchWithLlm(rawQuery, candidates);
    if (llmResult !== undefined) return llmResult; // undefined = LLM call failed, fall through
  }

  return matchWithKeywords(rawQuery, products);
}

// Ranks the whole catalog against the query and its expanded keywords, and
// keeps the top `size`. Always returns something (best-effort ordering) --
// deciding there's no good match is the LLM's job, not this filter's.
function shortlist(
  rawQuery: string,
  expandedKeywords: string[],
  products: CatalogEntry[],
  size: number
): CatalogEntry[] {
  if (products.length <= size) return products;

  const requestedColor = colorFromTitle(rawQuery);

  return products
    .map((product) => {
      // Colour lives in its own field, so fold it into the text the score
      // sees -- otherwise a title with no colour word can never match a
      // query that names one.
      const searchable = product.color ? `${product.title} ${product.color}` : product.title;
      const direct = relevanceScore(rawQuery, searchable);
      const viaKeywords = expandedKeywords.reduce(
        (best, keyword) => Math.max(best, relevanceScore(keyword, searchable)),
        0
      );
      let score = Math.max(direct, viaKeywords);

      // When the shopper names a colour, keep candidates of that colour in
      // contention even if nothing else about the wording lines up, and
      // push known-wrong colours down the list.
      if (requestedColor && product.color) {
        score = product.color === requestedColor ? Math.max(score, 0.8) : score * 0.3;
      }
      return { product, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, size)
    .map((scored) => scored.product);
}

interface LlmResponse {
  productId: string | null;
  reason?: string;
  matchType?: "exact" | "alternative";
}

// Returns `undefined` (not `null`) specifically when the LLM call itself
// failed, so the caller knows to fall back rather than treat it as a
// confident "no match".
async function matchWithLlm(rawQuery: string, products: CatalogEntry[]): Promise<MatchResult | null | undefined> {
  const catalogLines = products
    .map((p) => {
      const color = p.color ? ` | צבע: ${p.color}${p.colorIsSolid === false ? " (רב-צבעוני)" : ""}` : "";
      return `${p.id} | ${p.title}${color} | ₪${p.price}`;
    })
    .join("\n");

  const response = await completeJson<LlmResponse>([
    {
      role: "system",
      content:
        "אתה עוזר להשוואת מחירים המתמחה בבגדי תינוקות וילדים. תפקידך: מתוך רשימת מוצרים בחנות אחת, למצוא את " +
        "המוצר שהכי מתאים לתיאור החיפוש של הלקוח -- גם אם הניסוח שונה מהכותרת (מילים נרדפות, תיאור כללי, סדר " +
        'מילים שונה, שפה חופשית). התחשב בסוג הפריט (חולצה/מכנסיים/אוברול/בגד ים וכו\'), בצבע (מופיע בשדה "צבע" ' +
        "כשהוא ידוע), במגדר ובגיל -- אם צוינו. " +
        'סווג את ההתאמה: "exact" אם המוצר הוא באמת מה שהלקוח ביקש (אותו סוג פריט וגם הצבע שביקש, אם ביקש צבע); ' +
        '"alternative" אם זה הדבר הקרוב ביותר בחנות אבל לא בדיוק מה שביקש (למשל בגד גוף במקום חולצה). ' +
        "אל תבחר מוצר בצבע אחר מזה שהלקוח ביקש -- במקרה כזה עדיף להחזיר null. " +
        'מוצר המסומן "(רב-צבעוני)" אינו בצבע אחיד (למשל גוף לבן עם שרוולים בצבע אחר), ולכן כשהלקוח מבקש ' +
        'צבע מסוים הוא לכל היותר "alternative" ולעולם לא "exact". ' +
        "אם באמת אין שום מוצר מתאים או קרוב ברשימה, החזר null. ענה אך ורק ב-JSON בפורמט: " +
        '{"productId": "<המזהה המדויק מהרשימה>" | null, "matchType": "exact" | "alternative", ' +
        '"reason": "הסבר קצר בעברית (משפט אחד)"}',
    },
    {
      role: "user",
      content: `תיאור החיפוש של הלקוח: "${rawQuery}"\n\nמוצרים זמינים בחנות (מזהה | כותרת | צבע | מחיר):\n${catalogLines}`,
    },
  ]);

  if (response === null) return undefined; // network/parse failure -> let caller fall back

  if (!response.productId) return null; // LLM confidently found nothing suitable
  const product = products.find((p) => p.id === response.productId);
  if (!product) return undefined; // hallucinated id -> don't trust this response, fall back

  return { product, reason: response.reason ?? "", isExact: response.matchType !== "alternative" };
}

function matchWithKeywords(rawQuery: string, products: CatalogEntry[]): MatchResult | null {
  const requestedColor = colorFromTitle(rawQuery);
  let best: { product: CatalogEntry; score: number } | null = null;

  for (const product of products) {
    // Without the LLM there's no judgement available, so a known colour
    // mismatch is simply disqualifying rather than merely down-ranked.
    if (requestedColor && product.color && product.color !== requestedColor) continue;

    const searchable = product.color ? `${product.title} ${product.color}` : product.title;
    const score = relevanceScore(rawQuery, searchable);
    if (score >= KEYWORD_MATCH_THRESHOLD && (!best || score > best.score)) {
      best = { product, score };
    }
  }

  return best ? { product: best.product, reason: "התאמת מילות מפתח", isExact: true } : null;
}
