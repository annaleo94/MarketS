import { prisma } from "../db/prisma";
import { completeJsonAboutImage } from "../llm/openrouter.client";
import { legStyleFromText, LEG_STYLE_CATEGORIES } from "./taxonomy";
import { updateIfStillThere } from "./classify";
import { env } from "../env";

const VISION_CONCURRENCY = 5;

type LegStyle = "footed" | "footless";

// Fills in Product.legStyle for overalls and long pants -- whether the
// garment has built-in closed feet ("עם רגליות") or open ankles ("בלי
// רגליות"). Almost never stated in the title (unlike colour, where at
// least some stores publish it), so this is read off the product photo
// for nearly every candidate. Same shape as enrich-colors.ts: title first
// (free), then a bounded batch of vision calls, each product resolved once
// so re-ingests only pay for what's newly classified into these categories.
export async function enrichLegStyles(): Promise<{ fromTitle: number; fromVision: number; unresolved: number }> {
  const pending = await prisma.product.findMany({
    where: {
      categorySlug: { in: LEG_STYLE_CATEGORIES },
      legStyle: null,
      legStyleSource: null,
    },
    select: { id: true, title: true, imageUrl: true },
  });

  let fromTitle = 0;
  const needsVision: typeof pending = [];

  for (const product of pending) {
    const stated = legStyleFromText(product.title);
    if (stated) {
      if (await updateIfStillThere(product.id, { legStyle: stated, legStyleSource: "title" })) fromTitle += 1;
    } else if (product.imageUrl) {
      needsVision.push(product);
    }
  }

  let fromVision = 0;
  if (env.llmEnabled) {
    const batch = needsVision.slice(0, env.ingestMaxVisionCalls);

    for (let i = 0; i < batch.length; i += VISION_CONCURRENCY) {
      const slice = batch.slice(i, i + VISION_CONCURRENCY);
      const detected = await Promise.all(slice.map((p) => detectLegStyleFromImage(p.imageUrl!)));

      for (const [j, legStyle] of detected.entries()) {
        // null means the call itself never came back -- left alone so the
        // next run retries it, same distinction enrich-colors.ts draws.
        if (legStyle === undefined) continue;
        const updated = await updateIfStillThere(slice[j].id, {
          legStyle,
          legStyleSource: legStyle ? "vision" : "none",
        });
        if (updated && legStyle) fromVision += 1;
      }
    }
  }

  return { fromTitle, fromVision, unresolved: needsVision.length - fromVision };
}

interface DetectedLegStyle {
  hasFeet?: boolean | null;
}

// Asks specifically about foot coverage -- not colour, not garment type --
// so the same photo enrich-colors.ts already looked at is read a second,
// narrower time. "footed" means the leg openings close over the foot
// (an integrated sock/bootie, no separate ankle opening); "footless" means
// the garment ends at or above the ankle, open feet.
async function detectLegStyleFromImage(imageUrl: string): Promise<LegStyle | null | undefined> {
  const response = await completeJsonAboutImage<DetectedLegStyle>(
    `זו תמונה של אוברול או מכנסיים לתינוקות/ילדים מאתר חנות. התעלם מהרקע ומהדוגמן/ית. ` +
      `יש לבדוק רק דבר אחד: האם הבגד סגור מעל כפות הרגליים (כמו גרב/בוטי מובנה, בלי פתח קרסול נפרד) -- ` +
      `hasFeet=true, או שהוא נגמר בקרסול או מעליו עם כפות הרגליים חשופות -- hasFeet=false. ` +
      `אם לא ניתן לקבוע מהתמונה (התמונה לא מראה את קצה הרגליים, זווית לא ברורה וכו'), החזר hasFeet=null. ` +
      `ענה אך ורק ב-JSON: {"hasFeet": true|false|null}`,
    imageUrl
  );

  if (!response || typeof response.hasFeet === "undefined") return undefined; // call never came back
  if (response.hasFeet === null) return null; // looked, genuinely couldn't tell
  return response.hasFeet ? "footed" : "footless";
}
