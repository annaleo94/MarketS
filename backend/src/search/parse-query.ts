import { completeJson } from "../llm/openrouter.client";
import { CATEGORIES, categoryFromText, isKnownCategory } from "../catalog/taxonomy";
import { parseRequestedSize, MonthRange } from "../catalog/sizes";
import { colorFromTitle } from "../catalog/colors";
import { env } from "../env";
import { Gender } from "../catalog/classify";

// What the shopper actually constrained, pulled out of their free text.
// The first three are hard filters; the rest only affect ordering.
export interface ParsedQuery {
  categorySlug: string | null;
  size: MonthRange | null;
  sizeLabel: string | null; // how the shopper phrased it, for the filter chip
  gender: Gender | null;
  color: string | null;
  style: string | null;
  semanticQuery: string; // the descriptive remainder, used for ranking
}

// Parses without the LLM: enough to keep colour/size/category searches
// working when there's no API key, and used as the fallback if the call
// fails.
export function parseQueryLocally(raw: string): ParsedQuery {
  const size = parseRequestedSize(raw);
  return {
    categorySlug: categoryFromText(raw),
    size,
    sizeLabel: size ? raw.match(/(מידה|גיל)\s*[\w֐-׿-]+/)?.[0] ?? null : null,
    gender: genderFromQuery(raw),
    color: colorFromTitle(raw),
    style: null,
    semanticQuery: raw,
  };
}

// Only an explicit, unambiguous gender word counts. "לבנות" is deliberately
// absent: it is far more often the colour white than "for girls", and
// guessing wrong here removes real stock from the results.
function genderFromQuery(raw: string): Gender | null {
  if (/יוניסקס/.test(raw)) return "unisex";
  if (/\bלבנים\b|לילד\b|לבן שלי|בגדי בנים|לבנים /.test(raw)) return "boys";
  if (/לילדה\b|בגדי בנות|לבת שלי/.test(raw)) return "girls";
  return null;
}

interface LlmParsed {
  category?: string | null;
  gender?: string | null;
  color?: string | null;
  style?: string | null;
  ageMonths?: number | null;
  semanticQuery?: string | null;
}

export async function parseQuery(raw: string): Promise<ParsedQuery> {
  const local = parseQueryLocally(raw);
  if (!env.llmEnabled) return local;

  const response = await completeJson<LlmParsed>([
    {
      role: "system",
      content:
        "אתה מפרק שאילתת חיפוש חופשית של לקוח בחנות בגדי תינוקות וילדים לשדות מובנים. " +
        `category: בדיוק אחד מהערכים הבאים או null: ${CATEGORIES.map((c) => c.slug).join(", ")}. ` +
        "בחר את רמת ההיררכיה שהלקוח ביקש, לא יותר ספציפית ממנה: מילה כללית מקבלת את קטגוריית האב. " +
        "'בגד ים' -> swimwear (ולא swimsuit), 'חולצה' -> tops (ולא shirt-short), 'מכנסיים' -> bottoms. " +
        "רק אם הלקוח היה ספציפי בעצמו בחר צאצא: 'ביקיני' -> bikini, 'חולצה ארוכה' -> shirt-long. " +
        'gender: "girls"/"boys"/"unisex" רק אם הלקוח ציין במפורש, אחרת null. ' +
        'שים לב: "לבנה"/"לבנות" הם בדרך כלל הצבע לבן ולא מגדר. ' +
        "ageMonths: הגיל שהלקוח ביקש בחודשים (שנתיים=24, 3 חודשים=3), או null. " +
        "color: שם הצבע בעברית או null. style: אירוע/סגנון כמו 'חג', 'ספורט', או null. " +
        "semanticQuery: תיאור הפריט במילים של הלקוח, בלי המידה והמגדר. " +
        'ענה אך ורק ב-JSON: {"category":..., "gender":..., "color":..., "style":..., "ageMonths":..., "semanticQuery":...}',
    },
    { role: "user", content: raw },
  ]);

  if (!response) return local;

  const category = response.category && isKnownCategory(response.category) ? response.category : local.categorySlug;
  const size =
    typeof response.ageMonths === "number"
      ? { min: response.ageMonths, max: response.ageMonths + 3 }
      : local.size;

  return {
    categorySlug: category,
    size,
    sizeLabel: size ? local.sizeLabel ?? `${size.min} חודשים` : null,
    gender: normalizeGender(response.gender) ?? local.gender,
    color: response.color ? colorFromTitle(response.color) ?? local.color : local.color,
    style: response.style ?? null,
    semanticQuery: response.semanticQuery?.trim() || raw,
  };
}

function normalizeGender(raw: string | null | undefined): Gender | null {
  if (raw === "girls" || raw === "boys" || raw === "unisex") return raw;
  return null;
}
