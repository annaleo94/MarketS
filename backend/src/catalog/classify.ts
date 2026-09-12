import { prisma } from "../db/prisma";
import { completeJson } from "../llm/openrouter.client";
import { CATEGORIES, categoryFamily, categoryFromText, categoryWithDescendants, isKnownCategory } from "./taxonomy";
import { env } from "../env";

export type Gender = "boys" | "girls" | "unisex";

// Category and gender are hard filters, so a wrong value doesn't just
// rank a product badly -- it deletes it from results it belongs in. They
// are therefore taken from the store's own data wherever the store states
// them, and only inferred where it doesn't.
//
// Gender specifically defaults to "unisex" whenever it isn't stated,
// because unisex always passes the gender filter: an unknown is then shown
// to everyone rather than hidden from the person it was right for.

// Fox files gender in `vendor` ("בנות", "תינוקות בנים", "N.B יוניסקס")
// and garment type in `product_type` -- both free and authoritative.
export function genderFromStoreValue(raw: string | null | undefined): Gender | null {
  if (!raw) return null;
  const text = raw.trim();
  if (text.includes("יוניסקס") || text.toLowerCase().includes("unisex")) return "unisex";
  if (text.includes("בנות") || text.toLowerCase().includes("girl")) return "girls";
  if (text.includes("בנים") || text.toLowerCase().includes("boy")) return "boys";
  return null;
}

export function categoryFromStoreValue(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Fox marks a third of its catalogue "אחר" -- explicitly "no category",
  // so it must fall through to inference rather than be trusted.
  if (raw.trim() === "אחר") return null;
  return categoryFromText(raw);
}

// The store's own category and the title can each yield a slug; this picks
// between them. A store value isn't always a per-product fact -- Castro's
// adapter labels every product scraped off its "ילדים/מכנסיים" (boys'
// pants) page "מכנסיים", but that page also lists belts, so every belt on
// it inherited "bottoms" and leaked into pants searches ("חגורה קלאסית
// בנים" showing up for "מכנסיים"). The hint is really describing the page,
// not necessarily the product.
//
// So when the title names something from one of these families the store
// hint doesn't agree with, the title wins: each is named by specific,
// deliberate, hard-to-confuse words ("חגורה", "וסט", "קרדיגן", "בגד גוף",
// "בגד ים שלם"), and stores routinely cross-merchandise them onto some
// other page's listing (belts on the pants page, cardigans on the shirts
// page) but essentially never mislabel the reverse. Confirmed live for
// each: Castro's "חולצות" pages leak "וסט"/"קרדיגן" items into "חולצה"
// searches the same way its "מכנסיים" pages leaked belts, and some Fox
// swimsuits carry a "בגד גוף" store hint despite being swimwear.
//
// This stops well short of "any family mismatch" -- checked against the
// live catalogue, that broader rule looked appealing but flips titles like
// "חולצת גלישה" (a rash-guard swim shirt, correctly filed as swimwear by
// the store) to "tops" purely because "חולצת" also appears in it, which is
// a regression, not a fix. "tops"/"bottoms" specifically stay out of this
// list: both are common enough as an incidental word in a multi-item title
// ("סט חולצה ומכנסיים") that trusting them over the store isn't safe yet.
const TITLE_OVERRIDES_STORE_FAMILIES = new Set(["accessories", "outerwear", "bodysuit", "swimwear"]);

// A second, narrower kind of override: not a family disagreement, but a
// store bucket too coarse to have a slot for a real category at all. Audited
// Fox's own `product_type` directly (its 17 distinct values across the full
// catalogue) expecting it to be a clean per-product source -- and it mostly
// is, every other value maps straight onto an existing alias -- except
// leggings aren't one of its buckets: "טייץ בייסיק ארוך" (a legging) carries
// the same "מכנסיים ארוכים" product_type as actual long pants, in bulk (of
// Fox's "מכנסיים"/"מכנסיים קצרים"/"מכנסיים ארוכים" products, 38%/11%/46%
// are titled טייץ). No store-value mapping fixes that: the store's own
// scheme genuinely doesn't distinguish them. So when the title names
// leggings specifically and the store only offers a generic bottoms bucket,
// the title wins on specificity, not on disagreement.
const LEGGINGS_SLUGS = new Set(["leggings", "leggings-short", "leggings-long"]);
const GENERIC_BOTTOMS_SLUGS = new Set(["bottoms", "shorts", "pants"]);

// The same shape of case again, for footwear. Both shoe stores label whole
// category pages with a bare "נעליים" -- and for the stage pages ("צעד
// ראשון") that really is all the page says -- while the title names the
// actual kind: "סנדל בייבי בנים", "מגפי גשם", "נעלי בית". Without this the
// generic hint would win on every one of them and all several thousand
// shoes would sit in the one parent bucket, which would make the split in
// taxonomy.ts pointless. Deliberately as narrow as the leggings rule: only
// the bare parent counts as too coarse, and only one of its own
// descendants may refine it -- this is not a general "more specific title
// wins" rule, which the committed regression suite shows would be wrong
// (a "מכנסי ג'ינס" titled item under a "מכנסיים" store hint is meant to
// stay in the generic bottoms bucket, not become pants).
const GENERIC_SHOES_SLUG = "shoes";
const SHOE_SLUGS = new Set(categoryWithDescendants(GENERIC_SHOES_SLUG));

export type CategorySource = "store" | "title" | "text-llm" | "vision";

export interface CategoryResolution {
  slug: string | null;
  // Which signal actually won -- "store" or "title" for a deterministic
  // alias match (including the two override cases above, which are still
  // exact rule matches on the title, not a guess). Null slug means neither
  // resolved it.
  source: CategorySource | null;
}

export function resolveCategory(storeValue: string | null | undefined, title: string): CategoryResolution {
  const fromStore = categoryFromStoreValue(storeValue);
  const fromTitle = categoryFromText(title);
  if (fromTitle) {
    const titleFamily = categoryFamily(fromTitle);
    if (TITLE_OVERRIDES_STORE_FAMILIES.has(titleFamily) && categoryFamily(fromStore ?? "") !== titleFamily) {
      return { slug: fromTitle, source: "title" };
    }
    if (LEGGINGS_SLUGS.has(fromTitle) && fromStore && GENERIC_BOTTOMS_SLUGS.has(fromStore)) {
      return { slug: fromTitle, source: "title" };
    }
    if (fromStore === GENERIC_SHOES_SLUG && fromTitle !== GENERIC_SHOES_SLUG && SHOE_SLUGS.has(fromTitle)) {
      return { slug: fromTitle, source: "title" };
    }
  }
  if (fromStore) return { slug: fromStore, source: "store" };
  if (fromTitle) return { slug: fromTitle, source: "title" };
  return { slug: null, source: null };
}

interface Classified {
  id: string;
  category?: string;
  gender?: Gender;
  confidence?: number;
}

// Small enough that the reply comfortably fits the token budget below:
// one truncated response loses the whole batch.
const BATCH_SIZE = 25;
const CLASSIFY_MAX_TOKENS = 3000;

// A text-LLM category answer below this is treated as a guess worth a
// second, more expensive look at the actual photo (see
// enrich-category.ts) rather than trusted outright -- category is a hard
// filter, so a wrong value doesn't rank a product badly, it deletes it
// from results it belongs in.
export const LOW_CATEGORY_CONFIDENCE = 0.6;

// A product selected at the top of classifyCatalog() can be gone by the
// time its own turn to be updated comes around -- deleted by a store's own
// delete-missing pass earlier in the same ingest, or by a second ingest
// overlapping this one during a deploy. Surfaced in production: one row
// vanishing mid-batch aborted classification for the whole catalogue,
// including everything already correctly resolved earlier in the loop.
// Prisma's code for "the row this update targeted doesn't exist" is P2025;
// that one specific case is swallowed so the batch keeps going, anything
// else still throws.
export async function updateIfStillThere(id: string, data: Record<string, unknown>): Promise<boolean> {
  try {
    await prisma.product.update({ where: { id }, data });
    return true;
  } catch (err) {
    if ((err as { code?: string }).code === "P2025") return false;
    throw err;
  }
}

// Classifies whatever is still missing a category, in batches -- one call
// per batch rather than per product, which keeps a 1,500-product
// catalogue to a few dozen cheap text calls. This is the cheap first pass;
// enrich-category.ts follows it with a per-product vision look at whatever
// this still leaves null or answers with low confidence.
export async function classifyCatalog(): Promise<{ fromStore: number; fromLlm: number; unresolved: number }> {
  const pending = await prisma.product.findMany({
    where: { categorySlug: null },
    select: { id: true, title: true, category: true, gender: true },
  });

  let fromStore = 0;
  const needsLlm: { id: string; title: string }[] = [];

  for (const product of pending) {
    // `category` holds whatever the store called it; the title is the
    // fallback, since "חולצה ארוכה עם הדפס" names its own garment type --
    // unless the two flatly disagree on the garment family, in which case
    // the title wins (see resolveCategory).
    const { slug, source } = resolveCategory(product.category, product.title);
    if (slug) {
      if (await updateIfStillThere(product.id, { categorySlug: slug, categorySource: source })) fromStore += 1;
    } else {
      needsLlm.push({ id: product.id, title: product.title });
    }
  }

  let fromLlm = 0;
  if (env.llmEnabled) {
    for (let i = 0; i < needsLlm.length; i += BATCH_SIZE) {
      const batch = needsLlm.slice(i, i + BATCH_SIZE);
      const classified = await classifyBatch(batch);

      for (const item of classified) {
        if (!item.category || !isKnownCategory(item.category)) continue;
        const confidence = typeof item.confidence === "number" ? Math.max(0, Math.min(1, item.confidence)) : 0.5;
        const data = {
          categorySlug: item.category,
          categorySource: "text-llm" as const,
          categoryConfidence: confidence,
          ...(item.gender ? { gender: item.gender } : {}),
        };
        if (await updateIfStillThere(item.id, data)) fromLlm += 1;
      }
    }
  }

  const unresolved = await prisma.product.count({ where: { categorySlug: null } });
  return { fromStore, fromLlm, unresolved };
}

async function classifyBatch(batch: { id: string; title: string }[]): Promise<Classified[]> {
  const list = batch.map((p) => `${p.id} | ${p.title}`).join("\n");

  const response = await completeJson<{ items?: Classified[] }>([
    {
      role: "system",
      content:
        "אתה מסווג מוצרי ביגוד לתינוקות וילדים. לכל מוצר ברשימה החזר את הקטגוריה, המגדר ורמת הביטחון שלך. " +
        `הקטגוריה חייבת להיות בדיוק אחד מהערכים: ${CATEGORIES.map((c) => c.slug).join(", ")}. ` +
        "בחר את הקטגוריה הספציפית ביותר שמתאימה (למשל swim-shorts ולא swimwear, shirt-long ולא tops). " +
        'המגדר: "girls" רק אם ברור שזה לבנות, "boys" רק אם ברור שזה לבנים, אחרת "unisex". ' +
        'שים לב: בעברית "לבנות" יכול להיות גם צבע לבן ברבים -- אל תסיק מגדר ממנו כשמדובר בצבע. ' +
        "confidence: מספר בין 0 ל-1 -- כמה אתה בטוח בסיווג הקטגוריה על סמך הכותרת בלבד. " +
        "כותרת עמומה או כללית מדי (בלי לציין סוג בגד ברור) צריכה לקבל confidence נמוך, לא לנחש בביטחון. " +
        'ענה אך ורק ב-JSON: {"items": [{"id": "<המזהה>", "category": "<slug>", "gender": "girls|boys|unisex", "confidence": <0-1>}]}',
    },
    { role: "user", content: list },
  ], 40000, CLASSIFY_MAX_TOKENS);

  return Array.isArray(response?.items) ? response.items : [];
}
