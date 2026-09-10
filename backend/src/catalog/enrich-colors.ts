import { prisma } from "../db/prisma";
import { completeJsonAboutImage } from "../llm/openrouter.client";
import { colorFromTitle, normalizeColorName, CANONICAL_COLORS } from "./colors";
import { env } from "../env";

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
    for (const product of batch) {
      const color = await detectColorFromImage(product.imageUrl!);
      if (!color) continue;
      await prisma.product.update({
        where: { id: product.id },
        data: { color, colorSource: "vision" },
      });
      fromVision += 1;
    }
  }

  return { fromTitle, fromVision, unresolved: needsVision.length - fromVision };
}

async function detectColorFromImage(imageUrl: string): Promise<string | null> {
  const response = await completeJsonAboutImage<{ color?: string | null }>(
    `זו תמונה של פריט לבוש לתינוקות/ילדים מאתר חנות. מהו הצבע הדומיננטי של הבגד עצמו? ` +
      `התעלם מהרקע, מהדוגמן/ית ומהדפסים קטנים. ` +
      `בחר בדיוק אחד מהערכים הבאים: ${CANONICAL_COLORS.join(", ")}. ` +
      `אם התמונה לא מציגה בגד או שהצבע לא ברור, החזר null. ` +
      `ענה אך ורק ב-JSON: {"color": "<צבע>" | null}`,
    imageUrl
  );

  return normalizeColorName(response?.color);
}
