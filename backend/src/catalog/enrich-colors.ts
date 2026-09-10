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
    // colorSource is set even when nothing could be read off the photo, so
    // a genuinely undetectable product (a pack shot of hair clips) is paid
    // for once rather than re-attempted on every single ingest.
    where: { color: null, colorSource: null },
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
        if (!result) {
          // Record the attempt so the next run skips it (see the query above).
          await prisma.product.update({ where: { id: slice[j].id }, data: { colorSource: "none" } });
          continue;
        }
        await prisma.product.update({
          where: { id: slice[j].id },
          data: {
            color: result.colors[0],
            colors: result.colors.join(","),
            colorSource: "vision",
            colorIsSolid: result.isSolid,
          },
        });
        fromVision += 1;
      }
    }
  }

  return { fromTitle, fromVision, unresolved: needsVision.length - fromVision };
}

interface DetectedGarment {
  color?: string | null;
  isSolid?: boolean;
}

// Asks for one row per garment in the photo. A multipack shot shows two or
// three garments in different colours, and asking for "the" colour of that
// made the model answer with a bare array instead -- which parsed fine as
// JSON but had no `color` on it, so every multipack in the catalogue came
// back unresolved and was retried on every ingest, forever.
async function detectColorFromImage(imageUrl: string): Promise<{ colors: string[]; isSolid: boolean } | null> {
  const response = await completeJsonAboutImage<{ items?: DetectedGarment[] } | DetectedGarment[]>(
    `זו תמונה של פריט לבוש לתינוקות/ילדים מאתר חנות. התעלם מהרקע ומהדוגמן/ית. ` +
      `אם התמונה מציגה מארז של כמה בגדים, החזר שורה נפרדת לכל בגד במארז. ` +
      `לכל בגד: ` +
      `1) color -- הצבע העיקרי של הבגד עצמו, בדיוק אחד מהערכים: ${CANONICAL_COLORS.join(", ")}. ` +
      `2) isSolid -- false אם יש בבגד שילוב צבעים משמעותי, למשל שרוולים בצבע אחר מהגוף, ` +
      `פסים, או הדפס גדול שמכסה חלק ניכר מהבגד. הדפס קטן על החזה עדיין נחשב אחיד. ` +
      `אם התמונה לא מציגה בגד כלל או שהצבע לא ברור, החזר רשימה ריקה. ` +
      `ענה אך ורק ב-JSON: {"items": [{"color": "<צבע>", "isSolid": true|false}]}`,
    imageUrl
  );

  // Accept the bare array too: it is what the model reaches for on a
  // multipack even when asked for an object, and the data is right either way.
  const garments = Array.isArray(response) ? response : response?.items;
  if (!Array.isArray(garments)) return null;

  const colors: string[] = [];
  for (const garment of garments) {
    const color = normalizeColorName(garment?.color);
    if (color && !colors.includes(color)) colors.push(color);
  }
  if (colors.length === 0) return null;

  // A pack of differently-coloured garments is not a solid-coloured item,
  // whatever the individual garments are.
  const isSolid = colors.length === 1 && garments.every((g) => g?.isSolid !== false);
  return { colors, isSolid };
}
