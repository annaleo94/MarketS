import { prisma } from "../db/prisma";
import { completeJsonAboutImage } from "../llm/openrouter.client";
import { colorFromTitle, normalizeColorName, CANONICAL_COLORS } from "./colors";
import { env } from "../env";

const VISION_CONCURRENCY = 5;

// Fills in Product.color so colour searches can reach stores that publish
// none (Fox lists 242 shirts without a single colour anywhere in its feed).
// Titles are parsed for free; only what's left over costs a vision call,
// and each product is resolved once -- re-ingests skip anything already
// resolved, so the spend is one-off rather than per-run.
export async function enrichColors(): Promise<{ fromTitle: number; fromVision: number; unresolved: number }> {
  const pending = await prisma.product.findMany({
    where: { color: null },
    select: { id: true, title: true, imageUrl: true },
  });

  let fromTitle = 0;
  const needsVision: typeof pending = [];

  for (const product of pending) {
    const stated = colorFromTitle(product.title);
    if (stated) {
      await prisma.product.update({
        where: { id: product.id },
        data: { color: stated, colorSource: "title" },
      });
      fromTitle += 1;
    } else if (product.imageUrl) {
      needsVision.push(product);
    }
  }

  let fromVision = 0;
  if (env.llmEnabled) {
    // Bounded per run so a first ingest over a few thousand products
    // doesn't turn into one enormous bill or a half-hour job -- later runs
    // pick up where this one stopped.
    const batch = needsVision.slice(0, env.ingestMaxVisionCalls);

    // A few at a time: one-by-one leaves a whole catalogue's backlog taking
    // hours, while firing everything at once trips the provider's in-flight
    // spend cap and loses whole chunks of the batch to 402s.
    for (let i = 0; i < batch.length; i += VISION_CONCURRENCY) {
      const slice = batch.slice(i, i + VISION_CONCURRENCY);
      const detected = await Promise.all(slice.map((p) => detectColorFromImage(p.imageUrl!)));

      for (const [j, result] of detected.entries()) {
        if (!result) continue;
        await prisma.product.update({
          where: { id: slice[j].id },
          data: { color: result.color, colorSource: "vision", colorIsSolid: result.isSolid },
        });
        fromVision += 1;
      }
    }
  }

  return { fromTitle, fromVision, unresolved: needsVision.length - fromVision };
}

async function detectColorFromImage(imageUrl: string): Promise<{ color: string; isSolid: boolean } | null> {
  const response = await completeJsonAboutImage<{ color?: string | null; isSolid?: boolean }>(
    `זו תמונה של פריט לבוש לתינוקות/ילדים מאתר חנות. התעלם מהרקע ומהדוגמן/ית. ` +
      `1) מהו הצבע העיקרי של הבגד עצמו? בחר בדיוק אחד מהערכים: ${CANONICAL_COLORS.join(", ")}. ` +
      `2) האם הבגד בצבע אחיד אחד? החזר isSolid=false אם יש שילוב צבעים משמעותי -- ` +
      `למשל שרוולים בצבע אחר מהגוף, פסים, או הדפס גדול שמכסה חלק ניכר מהבגד. ` +
      `הדפס קטן על החזה עדיין נחשב אחיד. ` +
      `אם התמונה לא מציגה בגד או שהצבע לא ברור, החזר color=null. ` +
      `ענה אך ורק ב-JSON: {"color": "<צבע>" | null, "isSolid": true|false}`,
    imageUrl
  );

  const color = normalizeColorName(response?.color);
  if (!color) return null;
  return { color, isSolid: response?.isSolid !== false };
}
