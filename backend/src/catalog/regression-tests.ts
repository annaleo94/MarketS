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
import { diffProduct, diffDelisted, StoredProduct } from "./history";

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

// --- price / availability history -----------------------------------
// The rules behind "היה במבצע", "ירד במחיר" and "חזר למלאי". Pure
// functions, so the guarantees a shopper would actually notice are
// checked here rather than only being observable after a live sync.
const stored = (over: Partial<StoredProduct> = {}): StoredProduct => ({
  price: 100,
  inStock: true,
  listPrice: null,
  previousPrice: null,
  priceChangedAt: null,
  lowestPrice: 100,
  highestPrice: 100,
  delistedAt: null,
  displayStatus: "in_stock_unchanged",
  statusChangedAt: null,
  ...over,
} as StoredProduct);
const NOW = new Date("2026-01-01T00:00:00Z");
const kinds = (s: StoredProduct | null, o: Parameters<typeof diffProduct>[1]) =>
  diffProduct(s, o, NOW).events.map((e) => e.kind).sort().join(",");

const HISTORY_CASES: { got: string; expect: string; note: string }[] = [
  { got: kinds(null, { price: 80, inStock: true }), expect: "listed", note: "first sighting" },
  {
    got: kinds(null, { price: 80, inStock: true, listPrice: 120 }),
    expect: "listed,sale-start",
    note: "first sighting of something already discounted records the sale too",
  },
  { got: kinds(stored(), { price: 80, inStock: true }), expect: "price-drop", note: "price went down" },
  { got: kinds(stored(), { price: 120, inStock: true }), expect: "price-rise", note: "price went up" },
  { got: kinds(stored(), { price: 100, inStock: true }), expect: "", note: "nothing changed -- no event at all" },
  {
    got: kinds(stored(), { price: 100.004, inStock: true }),
    expect: "",
    note: "float noise under half an agora is not a price change",
  },
  {
    got: kinds(stored(), { price: 100, inStock: true, listPrice: 150 }),
    expect: "sale-start",
    note: "store started advertising a 'before' price without moving the price itself",
  },
  {
    got: kinds(stored({ listPrice: 150 }), { price: 100, inStock: true }),
    expect: "sale-end",
    note: "the 'before' price went away",
  },
  {
    got: kinds(stored(), { price: 100, inStock: true, listPrice: 90 }),
    expect: "",
    note: "a 'before' price BELOW the real price is not a discount",
  },
  {
    got: kinds(stored(), { price: 100, inStock: true, listPrice: 100 }),
    expect: "",
    note: "a 'before' price equal to the real price is not a discount either",
  },
  { got: kinds(stored(), { price: 100, inStock: false }), expect: "out-of-stock", note: "sold out" },
  {
    got: kinds(stored({ inStock: false }), { price: 100, inStock: true }),
    expect: "back-in-stock",
    note: "restocked",
  },
  {
    got: kinds(stored({ delistedAt: NOW, inStock: false }), { price: 90, inStock: true }),
    expect: "price-drop,relisted",
    note: "came back cheaper -- relist plus the price move, but no duplicate stock event",
  },
  {
    got: diffDelisted(stored()).map((e) => e.kind).join(","),
    expect: "delisted",
    note: "left the feed",
  },
  {
    got: diffDelisted(stored({ delistedAt: NOW })).map((e) => e.kind).join(","),
    expect: "",
    note: "still missing is not news -- only the first disappearance is an event",
  },
];
for (const c of HISTORY_CASES) {
  check(c.got === c.expect, `[history] ${c.note}`, c.got, c.expect);
}

// --- display status ---------------------------------------------------
// The badge each saved-list row shows. Worked out by the sync and stored,
// so these rules decide what a shopper sees days later without opening
// anything -- which is exactly why they're pinned down here.
const HOUR = 3_600_000;
const statusOf = (s: StoredProduct | null, o: Parameters<typeof diffProduct>[1]) =>
  diffProduct(s, o, NOW).update.displayStatus;

const STATUS_CASES: { got: string; expect: string; note: string }[] = [
  { got: statusOf(stored(), { price: 100, inStock: true }), expect: "in_stock_unchanged", note: "nothing going on" },
  { got: statusOf(stored(), { price: 100, inStock: false }), expect: "out_of_stock", note: "sold out wins over everything else -- it decides whether you can buy at all" },
  {
    got: statusOf(stored({ inStock: false }), { price: 100, inStock: true }),
    expect: "back_in_stock",
    note: "just came back",
  },
  {
    got: statusOf(stored({ displayStatus: "back_in_stock", statusChangedAt: new Date(NOW.getTime() - 10 * HOUR) }), { price: 100, inStock: true }),
    expect: "back_in_stock",
    note: "a return stays highlighted through the first 48 hours",
  },
  {
    got: statusOf(stored({ displayStatus: "back_in_stock", statusChangedAt: new Date(NOW.getTime() - 60 * HOUR) }), { price: 100, inStock: true }),
    expect: "in_stock_unchanged",
    note: "and stops being news after them",
  },
  { got: statusOf(stored(), { price: 80, inStock: true }), expect: "price_dropped", note: "price fell this sync" },
  {
    got: statusOf(stored({ previousPrice: 120, priceChangedAt: new Date(NOW.getTime() - 24 * HOUR) }), { price: 100, inStock: true }),
    expect: "price_dropped",
    note: "a drop from an earlier sync still shows -- the badge is a standing state, not a diff of one run",
  },
  {
    got: statusOf(stored({ previousPrice: 120, priceChangedAt: new Date(NOW.getTime() - 40 * 24 * HOUR) }), { price: 100, inStock: true }),
    expect: "in_stock_unchanged",
    note: "but a drop from a month ago is no longer news",
  },
  {
    got: statusOf(stored({ previousPrice: 80, priceChangedAt: new Date(NOW.getTime() - 24 * HOUR) }), { price: 100, inStock: true }),
    expect: "in_stock_unchanged",
    note: "a previous price BELOW the current one is a rise, not a drop",
  },
  { got: statusOf(stored(), { price: 100, inStock: true, listPrice: 150 }), expect: "on_sale", note: "store declared a sale without moving the price" },
  {
    got: statusOf(stored(), { price: 80, inStock: true, listPrice: 150 }),
    expect: "price_dropped",
    note: "a sale that also cut the price says the more useful of the two (the sale itself still shows as its own chip)",
  },
  { got: statusOf(null, { price: 80, inStock: true, listPrice: 150 }), expect: "on_sale", note: "first sighting of a discounted product" },
  { got: statusOf(null, { price: 80, inStock: true }), expect: "in_stock_unchanged", note: "first sighting of an ordinary one" },
  { got: statusOf(null, { price: 80, inStock: false }), expect: "out_of_stock", note: "first sighting of a sold-out one" },
];
for (const c of STATUS_CASES) {
  check(c.got === c.expect, `[status] ${c.note}`, c.got, c.expect);
}

// The 48h highlight counts from when the status was entered, so a quiet
// sync must not restart the clock and make "back in stock" last forever.
const entered = new Date(NOW.getTime() - 10 * HOUR);
const kept = diffProduct(stored({ displayStatus: "back_in_stock", statusChangedAt: entered }), { price: 100, inStock: true }, NOW).update;
check(kept.statusChangedAt.getTime() === entered.getTime(), "[status] an unchanged status keeps its original timestamp", kept.statusChangedAt, entered);

// The running min/max is what a "lowest price we've seen" claim rests on,
// so it gets its own check rather than riding on the event list.
const range = diffProduct(stored({ lowestPrice: 70, highestPrice: 130 }), { price: 60, inStock: true }, NOW).update;
check(range.lowestPrice === 60, "[history] a new low updates lowestPrice", range.lowestPrice, 60);
check(range.highestPrice === 130, "[history] a new low leaves highestPrice alone", range.highestPrice, 130);
check(range.previousPrice === 100, "[history] previousPrice keeps the price we just replaced", range.previousPrice, 100);

// A quick sanity check that the taxonomy itself hasn't silently lost a
// category a lot of the fixes above depend on existing.
for (const slug of ["belts", "outerwear", "bodysuit", "swimwear", "leggings", "leggings-short", "leggings-long", "tops", "bottoms"]) {
  check(categoryFromText(slug) !== undefined, `[sanity] categoryFromText doesn't throw on "${slug}"`, "ok", "ok");
}

// +3 for the lowest/highest/previousPrice checks, which are asserted
// directly rather than through a case table.
const total =
  CATEGORY_CASES.length +
  SOURCE_CASES.length +
  LEG_STYLE_CASES.length +
  AMBIGUOUS_COLOR_CASES.length +
  HISTORY_CASES.length +
  STATUS_CASES.length +
  4;
if (failures > 0) {
  console.error(`\n${failures}/${total} regression cases FAILED.`);
  process.exit(1);
} else {
  console.log(`All ${total} regression cases passed.`);
}
