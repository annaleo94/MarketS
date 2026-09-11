// A fixed, committed set of known-correct expectations for category/leg-
// style/colour-vs-gender resolution -- the "layer 4" regression suite: run
// this before any change to taxonomy.ts, classify.ts, an adapter's
// category-hint logic, or parse-query.ts's gender/colour handling.
//
//   npm run test:regression       (from backend/)
//
// Every case here traces back to a real, live-verified misclassification
// found and fixed during development -- not hypothetical ones. Add a new
// case whenever a live sweep or a shopper report turns up another one, so
// that specific bug can never silently come back. This checks the
// classification FUNCTIONS directly (no network, no DB, runs in
// milliseconds) -- it complements, but doesn't replace, spot-checking the
// live deployed site after a real ingest, which catches store-adapter and
// end-to-end issues this can't see.
//
// Exits with a non-zero code on any failure, so it can gate a deploy.

import { resolveCategory } from "./classify";
import { categoryFromText, legStyleFromText } from "./taxonomy";
import { suppressAmbiguousWhiteForGirls } from "../search/parse-query";

interface CategoryCase {
  title: string;
  storeCategory: string | null;
  expect: string;
  note: string;
}

// storeCategory is the raw value an adapter would pass through as
// Product.category -- for Castro that's the page-level hint from
// CATEGORY_PATHS; for Fox/Shilav it's the real Shopify product_type.
const CATEGORY_CASES: CategoryCase[] = [
  // --- Castro: belts cross-merchandised on the boys' "מכנסיים" page ---
  { title: "חגורה קלאסית בנים", storeCategory: "מכנסיים", expect: "belts", note: "belt leaking into pants search" },
  { title: "חגורת זמש בנים", storeCategory: "מכנסיים", expect: "belts", note: "construct-state חגורת form, no bare חגורה" },
  { title: "חגורה בסגנון צבאי", storeCategory: "מכנסיים", expect: "belts", note: "belt leaking into pants search" },
  { title: "מכנסי ג'ינס כחולים", storeCategory: "מכנסיים", expect: "bottoms", note: "real pants unaffected by the belt override (store's generic מכנסיים hint wins, as it should)" },
  { title: "מכנסיים קצרים עם חגורה קלועה", storeCategory: "מכנסיים", expect: "bottoms", note: "shorts that merely include a belt aren't pulled into belts (store's generic מכנסיים hint wins)" },

  // --- Castro: vests/cardigans cross-merchandised on the "חולצות" page ---
  { title: "וסט פסים", storeCategory: "חולצות", expect: "outerwear", note: "vest leaking into shirt search" },
  { title: "קרדיגן קרושה", storeCategory: "חולצות", expect: "outerwear", note: "cardigan leaking into shirt search" },
  { title: "חולצת טריקו כחולה", storeCategory: "חולצות", expect: "tops", note: "real shirt unaffected by the outerwear override" },

  // --- The regression the broader "any family wins" rule would have caused ---
  {
    title: "חולצת גלישה שרוול ארוך",
    storeCategory: "בגד ים",
    expect: "swimwear",
    note: "rash-guard swim shirt must NOT flip to tops just because חולצת appears in it -- tops/bottoms are deliberately excluded from the override",
  },

  // --- Fox: a swimsuit carrying a stray "בגד גוף" store hint ---
  { title: "בגד ים שלם", storeCategory: "בגד גוף", expect: "swimsuit", note: "swimsuit mistagged bodysuit by the store" },
  { title: "בגד גוף עם פסי קונטרסט", storeCategory: "חולצה", expect: "bodysuit", note: "real bodysuit unaffected" },

  // --- Fox: leggings hiding inside generic pants/shorts buckets ---
  { title: "טייץ בייסיק ארוך", storeCategory: "מכנסיים ארוכים", expect: "leggings", note: "Fox's product_type has no legging bucket at all" },
  { title: "טייץ חלק", storeCategory: "מכנסיים קצרים", expect: "leggings", note: "same, short-legging phrasing" },
  { title: "מכנסי ג'ינס ארוכים כחולים", storeCategory: "מכנסיים ארוכים", expect: "pants", note: "real long pants unaffected by the leggings override" },
  { title: "שורט ג'ינס", storeCategory: "מכנסיים קצרים", expect: "shorts", note: "real shorts unaffected by the leggings override" },

  // --- Leggings length split ---
  { title: "מארז 3 טייצים ארוכים", storeCategory: null, expect: "leggings-long", note: "long-legging listing gets the specific child" },
  { title: "מארז טייצים קצרים מודפסים", storeCategory: null, expect: "leggings-short", note: "short-legging listing gets the specific child" },
];

interface LegStyleCase {
  title: string;
  expect: "footed" | "footless" | null;
}

const LEG_STYLE_CASES: LegStyleCase[] = [
  { title: "אוברול ארוך דינוזאורים ללא רגליות", expect: "footless" },
  { title: "אוברול עם רגליות", expect: "footed" },
  { title: "שלישיית רגליות דחפורים", expect: null }, // "רגליות" IS the product name here, not a cut descriptor
];

interface AmbiguousColorCase {
  raw: string;
  gender: "girls" | "boys" | "unisex" | null;
  colorIn: string | null;
  expect: string | null;
  note: string;
}

const AMBIGUOUS_COLOR_CASES: AmbiguousColorCase[] = [
  {
    raw: "מכנסיים לבנות",
    gender: "girls",
    colorIn: "לבן",
    expect: null,
    note: "plain 'pants for girls' must NOT silently become a white-pants filter",
  },
  {
    raw: "חולצה לבנה לחג לבנות מידה 2",
    gender: "girls",
    colorIn: "לבן",
    expect: "לבן",
    note: "a genuinely separate colour word (לבנה) must survive alongside gender=girls",
  },
  {
    raw: "מכנסיים לבן לבנות",
    gender: "girls",
    colorIn: "לבן",
    expect: "לבן",
    note: "bare לבן as a separate token also counts as an unambiguous colour",
  },
  { raw: "מכנסיים לבנות", gender: null, colorIn: "לבן", expect: "לבן", note: "no gender resolved -- colour passes through untouched" },
];

let failures = 0;

function check(condition: boolean, label: string, got: unknown, expected: unknown): void {
  if (!condition) {
    failures++;
    console.error(`FAIL: ${label}\n  expected: ${JSON.stringify(expected)}\n  got:      ${JSON.stringify(got)}`);
  }
}

for (const c of CATEGORY_CASES) {
  const got = resolveCategory(c.storeCategory, c.title).slug;
  check(got === c.expect, `[category] ${c.note} -- "${c.title}" (store: ${c.storeCategory})`, got, c.expect);
}

// resolveCategory's `source` is what enrich-category.ts's low-confidence
// vision follow-up and any future audit key off of -- worth locking down
// directly, not just the slug it resolves to.
const SOURCE_CASES: { title: string; storeCategory: string | null; expect: "store" | "title" | null }[] = [
  { title: "חולצת טריקו כחולה", storeCategory: "חולצות", expect: "store" },
  { title: "חגורה קלאסית בנים", storeCategory: "מכנסיים", expect: "title" }, // the override wins on title
  { title: "פריט מיוחד לחג", storeCategory: null, expect: null }, // names no garment at all -- falls to text-llm/vision
];
for (const c of SOURCE_CASES) {
  const got = resolveCategory(c.storeCategory, c.title).source;
  check(got === c.expect, `[category source] "${c.title}" (store: ${c.storeCategory})`, got, c.expect);
}

for (const c of LEG_STYLE_CASES) {
  const got = legStyleFromText(c.title);
  check(got === c.expect, `[legStyle] "${c.title}"`, got, c.expect);
}

for (const c of AMBIGUOUS_COLOR_CASES) {
  const got = suppressAmbiguousWhiteForGirls(c.raw, c.gender, c.colorIn);
  check(got === c.expect, `[ambiguous color] ${c.note} -- "${c.raw}"`, got, c.expect);
}

// A quick sanity check that the taxonomy itself hasn't silently lost a
// category a lot of the fixes above depend on existing.
for (const slug of ["belts", "outerwear", "bodysuit", "swimwear", "leggings", "leggings-short", "leggings-long", "tops", "bottoms"]) {
  check(categoryFromText(slug) !== undefined, `[sanity] categoryFromText doesn't throw on "${slug}"`, "ok", "ok");
}

const total = CATEGORY_CASES.length + SOURCE_CASES.length + LEG_STYLE_CASES.length + AMBIGUOUS_COLOR_CASES.length;
if (failures > 0) {
  console.error(`\n${failures}/${total} regression cases FAILED.`);
  process.exit(1);
} else {
  console.log(`All ${total} regression cases passed.`);
}
