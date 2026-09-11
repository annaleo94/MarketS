import { completeJson } from "../llm/openrouter.client";
import { CATEGORIES, categoryFromText, isKnownCategory, legStyleFromText } from "../catalog/taxonomy";
import { parseRequestedSize, MonthRange } from "../catalog/sizes";
import { colorFromTitle } from "../catalog/colors";
import { tokenize } from "../scrapers/normalize";
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
  legStyle: "footed" | "footless" | null; // "אוברול עם רגליות" / "מכנס בלי רגליות"
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
    legStyle: legStyleFromText(raw),
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
  legStyle?: string | null;
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
        "'בגד גוף' הוא bodysuit -- קטגוריה נפרדת מ-tops, לא צאצא שלה: בגד גוף אינו סוג של חולצה. " +
        "'אביזרים'/'אקססוריז' כללי -> accessories; ספציפי ('גרביים','כובע','חגורה','גומייה לשיער','גרביון') -> הצאצא המתאים (socks/hats/belts/hair-accessories/tights). " +
        "רק אם הלקוח היה ספציפי בעצמו בחר צאצא: 'ביקיני' -> bikini, 'חולצה ארוכה' -> shirt-long. " +
        'gender: "girls"/"boys"/"unisex" רק אם הלקוח ציין במפורש, אחרת null. ' +
        'שים לב: "לבנה"/"לבנות" עשוי להיות גם הצבע לבן וגם "מגדר" (לבנות=לילדות/בנות) -- ' +
        'אם ההקשר מתאים יותר למגדר (למשל שם פריט שלא דורש התאמה דקדוקית נקבה לצבע לבן, ' +
        'כמו "מכנסיים לבנות"), בחר מגדר בלבד ואל תחזיר גם צבע לבן מאותה מילה. ' +
        "ageMonths: הגיל שהלקוח ביקש בחודשים (שנתיים=24, 3 חודשים=3), או null. " +
        "color: שם הצבע בעברית או null. style: אירוע/סגנון כמו 'חג', 'ספורט', או null. " +
        "legStyle: רלוונטי רק לאוברול/מכנסיים -- \"footed\" אם הלקוח ביקש שהבגד סגור מעל כפות הרגליים " +
        "('עם רגליות', 'עם כפות רגליים'), \"footless\" אם ביקש שהרגליים יהיו חשופות/פתוחות " +
        "('בלי רגליות', 'ללא רגליות', 'עם קרסול פתוח'), אחרת null. " +
        "semanticQuery: תיאור הפריט במילים של הלקוח, בלי המידה והמגדר. " +
        'ענה אך ורק ב-JSON: {"category":..., "gender":..., "color":..., "legStyle":..., "style":..., "ageMonths":..., "semanticQuery":...}',
    },
    { role: "user", content: raw },
  ]);

  if (!response) return local;

  const category = response.category && isKnownCategory(response.category) ? response.category : local.categorySlug;
  const size =
    typeof response.ageMonths === "number"
      ? { min: response.ageMonths, max: response.ageMonths + 3 }
      : local.size;
  const gender = normalizeGender(response.gender) ?? local.gender;

  // Falling back to `local.color` whenever the LLM said null used to
  // override its judgement even when it correctly decided there's no
  // colour to report: the LLM successfully read "מכנסיים לבנות" as gender
  // (girls), returned color: null on purpose, and this promptly overrode
  // that with local.color's bare-keyword scan, which knows nothing about
  // that context and matches "לבנות" as white regardless. `local.color`
  // only makes sense as a fallback for a *failed* LLM call, which is
  // already handled by the `!response` return above -- not for a field
  // the LLM successfully decided was empty.
  const color = suppressAmbiguousWhiteForGirls(
    raw,
    gender,
    response.color ? colorFromTitle(response.color) ?? local.color : null
  );

  return {
    categorySlug: category,
    size,
    sizeLabel: size ? local.sizeLabel ?? `${size.min} חודשים` : null,
    gender,
    color,
    legStyle: normalizeLegStyle(response.legStyle) ?? local.legStyle,
    style: response.style ?? null,
    semanticQuery: response.semanticQuery?.trim() || raw,
  };
}

// Deterministic backstop for the same "לבנות" ambiguity the prompt above
// already asks the model to resolve -- in case it doesn't. Once gender has
// resolved to girls, "לבן" surviving alongside it is trusted only if the
// query also names an unambiguous white form that isn't itself the
// gender-bearing word -- "לבנה" ("חולצה לבנה לבנות" genuinely wants both) or
// bare "לבן". ("לבנים" is excluded: it carries the exact same ambiguity for
// boys -- "בנים" -- so it proves nothing here.) Otherwise the colour is
// dropped rather than silently narrowing "pants for girls" down to "white
// pants for girls" and reordering/hiding the rest of real stock.
//
// Matched as whole tokens, not a substring regex: Hebrew letters aren't
// \w in JS, so \b silently fails to bound them (confirmed: /\bלבן\b/ does
// not match "חולצה לבן" at all) and would have made this backstop inert.
export function suppressAmbiguousWhiteForGirls(raw: string, gender: Gender | null, color: string | null): string | null {
  if (gender !== "girls" || color !== "לבן") return color;
  const tokens = tokenize(raw);
  return tokens.includes("לבנה") || tokens.includes("לבן") ? color : null;
}

function normalizeLegStyle(raw: string | null | undefined): "footed" | "footless" | null {
  if (raw === "footed" || raw === "footless") return raw;
  return null;
}

function normalizeGender(raw: string | null | undefined): Gender | null {
  if (raw === "girls" || raw === "boys" || raw === "unisex") return raw;
  return null;
}
