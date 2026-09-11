import { prisma } from "../db/prisma";
import { completeJsonAboutImage } from "../llm/openrouter.client";
import { CATEGORIES, isKnownCategory } from "./taxonomy";
import { updateIfStillThere, LOW_CATEGORY_CONFIDENCE } from "./classify";
import { env } from "../env";

const VISION_CONCURRENCY = 5;

// classifyCatalog() resolves most of the catalogue for free (store data or
// a title alias match) and leans on a cheap text-only LLM batch for
// whatever's left. This picks up where that stops: a product the text pass
// never resolved at all, or one it only guessed at with low confidence
// (LOW_CATEGORY_CONFIDENCE) -- title text alone genuinely isn't always
// enough ("מארז לניו בורן" names no garment at all), but the photo usually
// is. Same shape as enrich-colors.ts/enrich-leg-style.ts: bounded per run,
// each product resolved (or conclusively given up on) once.
export async function enrichCategoriesFromImages(): Promise<{ resolved: number; unresolved: number }> {
  const pending = await prisma.product.findMany({
    where: {
      OR: [
        // Never attempted by anything with a photo yet.
        { categorySlug: null, categorySource: null },
        // The text pass answered, but wasn't confident. A vision source
        // afterwards is treated as final regardless of its own confidence
        // (still recorded, just not requeued) -- otherwise a genuinely
        // ambiguous product would eat a vision call on every single ingest
        // forever.
        { categorySource: "text-llm", categoryConfidence: { lt: LOW_CATEGORY_CONFIDENCE } },
      ],
    },
    select: { id: true, title: true, imageUrl: true },
  });

  const withImage = pending.filter((p) => p.imageUrl);

  let resolved = 0;
  if (env.llmEnabled) {
    const batch = withImage.slice(0, env.ingestMaxVisionCalls);

    for (let i = 0; i < batch.length; i += VISION_CONCURRENCY) {
      const slice = batch.slice(i, i + VISION_CONCURRENCY);
      const detected = await Promise.all(slice.map((p) => detectCategoryFromImage(p.imageUrl!)));

      for (const [j, result] of detected.entries()) {
        // null means the call itself never came back -- left alone so the
        // next run retries it, same distinction every enrich-*.ts draws.
        if (!result) continue;

        if (result.category && isKnownCategory(result.category)) {
          const updated = await updateIfStillThere(slice[j].id, {
            categorySlug: result.category,
            categorySource: "vision",
            categoryConfidence: result.confidence,
          });
          if (updated) resolved += 1;
        } else {
          // Looked at the photo, genuinely couldn't tell -- terminal
          // (categorySource is no longer null/"text-llm", so this row
          // stops matching the query above) rather than left to retry
          // forever, same as colorSource "none". Not counted as resolved.
          await updateIfStillThere(slice[j].id, { categorySource: "vision", categoryConfidence: 0 });
        }
      }
    }
  }

  const unresolved = await prisma.product.count({ where: { categorySlug: null } });
  return { resolved, unresolved };
}

interface DetectedCategory {
  category?: string | null;
  confidence?: number | null;
}

async function detectCategoryFromImage(imageUrl: string): Promise<{ category: string | null; confidence: number } | null> {
  const response = await completeJsonAboutImage<DetectedCategory>(
    `זו תמונה של פריט לבוש לתינוקות/ילדים מאתר חנות. התעלם מהרקע ומהדוגמן/ית. ` +
      `סווג את הפריט לקטגוריה אחת מהרשימה הבאה, בדיוק: ${CATEGORIES.map((c) => c.slug).join(", ")}. ` +
      `בחר את הקטגוריה הספציפית ביותר שברור מהתמונה עצמה (למשל bodysuit ולא tops, swim-shorts ולא swimwear); ` +
      `רק אם התמונה לא מספיק ברורה כדי להיות בטוח ברמה הזו, בחר את קטגוריית האב הכללית יותר. ` +
      `אם אי אפשר לזהות בגד בתמונה כלל, category=null. ` +
      `confidence: מספר בין 0 ל-1 -- כמה אתה בטוח בסיווג על סמך התמונה. ` +
      `ענה אך ורק ב-JSON: {"category": "<slug>", "confidence": <0-1>}`,
    imageUrl
  );

  if (!response) return null; // the call itself never came back
  const confidence =
    typeof response.confidence === "number" ? Math.max(0, Math.min(1, response.confidence)) : 0.5;
  return { category: response.category ?? null, confidence };
}
