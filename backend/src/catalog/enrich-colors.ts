import { prisma } from "../db/prisma";
import { completeJsonAboutImage } from "../llm/openrouter.client";
import { colorFromTitle, normalizeColorName, CANONICAL_COLORS } from "./colors";
import { updateIfStillThere } from "./classify";
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
      if (await updateIfStillThere(product.id, { color: stated, colorSource: "title" })) fromTitle += 1;
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
        // A request that never got an answer (a dropped TLS connection) is
        // left alone so the next run retries it. Only a model that looked
        // and found no garment is recorded as settled.
        if (!result) continue;
        if (result.colors.length === 0) {
          await updateIfStillThere(slice[j].id, { colorSource: "none", colorConfidence: 0 });
          continue;
        }
        const updated = await updateIfStillThere(slice[j].id, {
          color: result.colors[0],
          colors: result.colors.join(","),
          colorSource: "vision",
          colorIsSolid: result.isSolid,
          colorConfidence: result.confidence,
        });
        if (updated) fromVision += 1;
      }
    }
  }

  return { fromTitle, fromVision, unresolved: needsVision.length - fromVision };
}

interface DetectedGarment {
  color?: string | null;
  isSolid?: boolean;
  confidence?: number;
}

// Asks for one row per garment in the photo. A multipack shot shows two or
// three garments in different colours, and asking for "the" colour of that
// made the model answer with a bare array instead -- which parsed fine as
// JSON but had no `color` on it, so every multipack in the catalogue came
// back unresolved and was retried on every ingest, forever.
async function detectColorFromImage(
  imageUrl: string
): Promise<{ colors: string[]; isSolid: boolean; confidence: number } | null> {
  const response = await completeJsonAboutImage<{ items?: DetectedGarment[] } | DetectedGarment[]>(
    `זו תמונה של פריט לבוש לתינוקות/ילדים מאתר חנות. התעלם מהרקע ומהדוגמן/ית. ` +
      `אם התמונה מציגה מארז של כמה בגדים, החזר שורה נפרדת לכל בגד במארז. ` +
      `לכל בגד: ` +
      `1) color -- הצבע העיקרי של הבגד עצמו, בדיוק אחד מהערכים: ${CANONICAL_COLORS.join(", ")}. ` +
      `2) isSolid -- false אם יש בבגד שילוב צבעים משמעותי, למשל שרוולים בצבע אחר מהגוף, ` +
      `פסים, או הדפס גדול שמכסה חלק ניכר מהבגד. הדפס קטן על החזה עדיין נחשב אחיד. ` +
      `3) confidence -- מספר בין 0 ל-1, כמה אתה בטוח בצבע שזיהית. ` +
      `אם התמונה לא מציגה בגד כלל או שהצבע לא ברור, החזר רשימה ריקה. ` +
      `ענה אך ורק ב-JSON: {"items": [{"color": "<צבע>", "isSolid": true|false, "confidence": <0-1>}]}`,
    imageUrl
  );

  // Accept the bare array too: it is what the model reaches for on a
  // multipack even when asked for an object, and the data is right either way.
  const garments = Array.isArray(response) ? response : response?.items;
  if (!Array.isArray(garments)) return null;

  const colors: string[] = [];
  const confidences: number[] = [];
  for (const garment of garments) {
    const color = normalizeColorName(garment?.color);
    if (color && !colors.includes(color)) {
      colors.push(color);
      confidences.push(typeof garment?.confidence === "number" ? Math.max(0, Math.min(1, garment.confidence)) : 0.5);
    }
  }

  // An empty set here is a real answer -- the model looked and saw no
  // garment -- as distinct from the null above, which means the call never
  // came back. The caller settles the first and retries the second.
  // A pack of differently-coloured garments is not a solid-coloured item,
  // whatever the individual garments are.
  const isSolid = colors.length === 1 && garments.every((g) => g?.isSolid !== false);
  // The record covers every colour in the pack, so its confidence is only
  // as good as the shakiest garment in it, not just the first one.
  const confidence = confidences.length > 0 ? Math.min(...confidences) : 0.5;
  return { colors, isSolid, confidence };
}
