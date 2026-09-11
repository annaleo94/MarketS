import { prisma } from "../db/prisma";
import { completeJson } from "../llm/openrouter.client";
import { CATEGORIES, categoryFamily, categoryFromText, isKnownCategory } from "./taxonomy";
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
// So when the title names an ACCESSORY the store hint doesn't agree is one
// -- a belt, a hat, a hair tie -- the title wins: a specific accessory word
// is a very deliberate, unambiguous choice for a title to make, and stores
// routinely cross-merchandise accessories onto a clothing page's listing
// (exactly what happened here) but essentially never do the reverse. The
// override stops there rather than at "any family mismatch" -- checked
// against the live catalogue, a broader "title always wins" rule flips
// titles like "חולצת גלישה" (a rash-guard swim shirt, correctly filed as
// swimwear by the store) to "tops" purely because "חולצת" also appears in
// it, which is a regression, not a fix.
export function resolveCategory(storeValue: string | null | undefined, title: string): string | null {
  const fromStore = categoryFromStoreValue(storeValue);
  const fromTitle = categoryFromText(title);
  if (fromTitle && categoryFamily(fromTitle) === "accessories" && categoryFamily(fromStore ?? "") !== "accessories") {
    return fromTitle;
  }
  return fromStore ?? fromTitle;
}

interface Classified {
  id: string;
  category?: string;
  gender?: Gender;
}

// Small enough that the reply comfortably fits the token budget below:
// one truncated response loses the whole batch.
const BATCH_SIZE = 25;
const CLASSIFY_MAX_TOKENS = 2500;

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
// catalogue to a few dozen cheap text calls.
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
    const slug = resolveCategory(product.category, product.title);
    if (slug) {
      if (await updateIfStillThere(product.id, { categorySlug: slug })) fromStore += 1;
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
        const data = { categorySlug: item.category, ...(item.gender ? { gender: item.gender } : {}) };
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
        "אתה מסווג מוצרי ביגוד לתינוקות וילדים. לכל מוצר ברשימה החזר את הקטגוריה והמגדר. " +
        `הקטגוריה חייבת להיות בדיוק אחד מהערכים: ${CATEGORIES.map((c) => c.slug).join(", ")}. ` +
        "בחר את הקטגוריה הספציפית ביותר שמתאימה (למשל swim-shorts ולא swimwear, shirt-long ולא tops). " +
        'המגדר: "girls" רק אם ברור שזה לבנות, "boys" רק אם ברור שזה לבנים, אחרת "unisex". ' +
        'שים לב: בעברית "לבנות" יכול להיות גם צבע לבן ברבים -- אל תסיק מגדר ממנו כשמדובר בצבע. ' +
        'ענה אך ורק ב-JSON: {"items": [{"id": "<המזהה>", "category": "<slug>", "gender": "girls|boys|unisex"}]}',
    },
    { role: "user", content: list },
  ], 40000, CLASSIFY_MAX_TOKENS);

  return Array.isArray(response?.items) ? response.items : [];
}
