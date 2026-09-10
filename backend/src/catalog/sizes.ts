// Sizes are a hard filter, so they have to compare across the three ways
// these stores write them: months ("NB", "3M", "18-24"), years ("2", "5Y")
// and ranges. Everything is normalised to a range of months, and matching
// is range overlap -- a product stocked in 18-24m does satisfy a request
// for a 2-year-old only if the ranges actually meet.

export interface MonthRange {
  min: number;
  max: number;
}

const YEAR = 12;

// One size label as a store writes it -> the months it covers.
export function parseSizeLabel(raw: string): MonthRange | null {
  const label = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!label) return null;

  if (/^(n\.?b\.?|newborn|ניובורן)$/.test(label)) return { min: 0, max: 3 };

  // "2-3y", "9-10y" -- a span of years. TerminalX sizes most of its
  // clothing this way, and without this the label parses to nothing: an
  // item stocked in 2-3Y/3-4Y/4-5Y was dropped outright from a search for
  // size 4, which is a hard filter deleting stock the shopper asked for.
  const yearRange = label.match(/^(\d+)-(\d+)\s*(y|שנים)$/);
  if (yearRange) {
    const [, from, to] = yearRange;
    return { min: Number(from) * YEAR, max: (Number(to) + 1) * YEAR };
  }

  // "18-24m", "0-3", "3-6"
  const range = label.match(/^(\d+)-(\d+)\s*(m|מ|ח)?$/);
  if (range) {
    const [, from, to] = range;
    return { min: Number(from), max: Number(to) };
  }

  // "3m", "24m"
  const months = label.match(/^(\d+)\s*(m|מ|ח)$/);
  if (months) {
    const n = Number(months[1]);
    return { min: n, max: n + 3 };
  }

  // "2y", "5y"
  const years = label.match(/^(\d+)\s*(y|שנים|שנה)$/);
  if (years) {
    const n = Number(years[1]);
    return { min: n * YEAR, max: (n + 1) * YEAR };
  }

  // A bare number: these catalogues use it for years (2, 3, 4, 5) below 15,
  // and for centimetres/EU shoe sizes above that -- which we can't compare
  // to age, so it's left unparsed rather than guessed at.
  const bare = label.match(/^(\d+)$/);
  if (bare) {
    const n = Number(bare[1]);
    if (n >= 1 && n <= 14) return { min: n * YEAR, max: (n + 1) * YEAR };
  }

  return null;
}

// Every size a product is stocked in, as its own range. Deliberately not
// merged into one span: a product sold in 0-3m and 5y would span
// everything in between and answer requests for sizes it doesn't stock.
export function productSizeRanges(sizesCsv: string | null): MonthRange[] {
  if (!sizesCsv) return [];
  return sizesCsv
    .split(",")
    .map((s) => parseSizeLabel(s))
    .filter((r): r is MonthRange => r !== null);
}

// Footwear is sized on a scale of its own (EU 19-31 for this age group),
// which says nothing about the wearer's age. Distinguishing it from a label
// we simply couldn't read matters: an unreadable label should let a product
// through, but a shoe sized 20-26 answering every age query is just wrong.
export function isShoeSizeLabel(raw: string): boolean {
  const label = raw.trim().replace(/\s+/g, "");
  const n = Number(label.replace(",", "."));
  return Number.isFinite(n) && n >= 15 && n <= 50;
}

// Does the product actually stock something in the requested age? Products
// whose sizes we couldn't parse at all return true -- an unreadable label
// is missing information, and a hard filter shouldn't delete stock over
// that (the shopper still sees the size list and can judge).
export function productHasSize(sizesCsv: string | null, requested: MonthRange): boolean {
  const ranges = productSizeRanges(sizesCsv);
  if (ranges.length > 0) return ranges.some((r) => rangesOverlap(r, requested));

  // Nothing on the age scale. If every label we can see is a shoe size, the
  // product isn't answerable by an age at all -- excluding it is right,
  // whereas the fallback below would have it match every age there is.
  const labels = (sizesCsv ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (labels.length > 0 && labels.every(isShoeSizeLabel)) return false;

  return true;
}

// What the shopper asked for, in months: "שנתיים", "גיל 3 חודשים",
// "מידה 4", "18 חודשים".
export function parseRequestedSize(query: string): MonthRange | null {
  const text = query.trim();

  const namedYears: Record<string, number> = {
    שנה: 1,
    שנתיים: 2,
    שלוש: 3,
    ארבע: 4,
    חמש: 5,
    שש: 6,
  };
  for (const [word, years] of Object.entries(namedYears)) {
    if (text.includes(word)) return { min: years * YEAR, max: (years + 1) * YEAR };
  }

  const months = text.match(/(\d+)\s*(חודשים|חודש|months|month|m\b)/);
  if (months) {
    const n = Number(months[1]);
    return { min: n, max: n + 3 };
  }

  const years = text.match(/(?:גיל|מידה|בת|בן)\s*(\d+)/);
  if (years) {
    const n = Number(years[1]);
    if (n >= 1 && n <= 14) return { min: n * YEAR, max: (n + 1) * YEAR };
  }

  return null;
}

export function rangesOverlap(a: MonthRange, b: MonthRange): boolean {
  return a.min < b.max && b.min < a.max;
}
