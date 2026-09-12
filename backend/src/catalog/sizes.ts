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

  if (/^(nb|newborn|ניובורן)$/.test(label)) return { min: 0, max: 3 };

  // Footwear is on its own scale (EU sizes) and must not be read as an age
  // at all -- checked before the bare-range rules below, which would
  // otherwise happily misread e.g. "25-30" as an age range.
  if (isShoeSizeLabel(label)) return null;

  // "4-5", "6-7", "10-11", "12-14" -- a step of the years ladder written
  // bare. Confirmed against Castro's own catalogue: every bare range no
  // wider than two years, fully inside 1-14, that this store actually
  // uses (4-5, 6-7, 8-9, 10-11, 12-13, 4-6, 6-8, 8-10, 10-12, 12-14, 2-4)
  // appears only on its ילדים/ילדות (2-14y) pages -- never once on a baby
  // page, where the equivalent months would be nonsensical (a "4-6" that
  // meant months would overlap the 0-24m range every other store already
  // covers with 0-3/3-6/6-12/12-18/18-24). Checked before the general
  // month-range rule below, which would otherwise read every one of these
  // as an implausible number of months instead.
  const yearRange = label.match(/^(\d+)-(\d+)$/);
  if (yearRange) {
    const from = Number(yearRange[1]);
    const to = Number(yearRange[2]);
    if (from >= 1 && to <= 14 && to - from <= 2) return { min: from * YEAR, max: (to + 1) * YEAR };
  }

  // "18-24m", "0-3", "3-6". The upper number is a month the garment still
  // fits, not the month it stops fitting: a baby of exactly 24 months
  // wears 18-24m, which is why the store prints 24 on the label. Treating
  // it as exclusive made every month range fall one month short of the
  // next rung up, so a skirt stocked NB..18-24m never answered a search
  // for "מידה 2" (24-36m), and a 0-3m bodysuit never answered "3 חודשים"
  // -- reported from the live site, and true of every month range in
  // every store's catalogue, not just these. The years ladder above
  // already reads its upper bound inclusively (4-5 covers all of age 5);
  // this brings months into line with it.
  const range = label.match(/^(\d+)-(\d+)\s*(m|מ|ח)?$/);
  if (range) {
    const [, from, to] = range;
    return { min: Number(from), max: Number(to) + 1 };
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

// Footwear (and foot-sized accessories like socks sold by shoe-size band)
// is on its own EU scale, which says nothing about the wearer's age. Any
// label naming or spanning that scale counts -- not just every label on
// the product, since one unrelated entry shouldn't rescue the reading:
// Castro lists some shoes as a single combined band ("25-30") alongside
// individual sizes ("22".."35") elsewhere in the same catalogue.
export function isShoeSizeLabel(raw: string): boolean {
  const label = raw.trim().replace(/\s+/g, "");
  // Lower bound is 22, not the true minimum EU shoe size (which runs
  // lower): "18-24" is an extremely common, load-bearing month range used
  // by every store here, and 15-21 would have swallowed it whole -- both
  // endpoints of a range must clear this bound, so "18-24" fails on 18
  // long before "24" is even considered. 22 is also the lowest shoe size
  // actually seen in the one catalogue that has them.
  const inShoeRange = (n: number) => Number.isFinite(n) && n >= 22 && n <= 45;

  const single = Number(label);
  if (inShoeRange(single)) return true;

  const range = label.match(/^(\d+)-(\d+)$/);
  if (range) return inShoeRange(Number(range[1])) && inShoeRange(Number(range[2]));

  return false;
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

// Does the product actually stock something in the requested age? Products
// whose sizes we couldn't parse at all return true -- an unreadable label
// is missing information, and a hard filter shouldn't delete stock over
// that (the shopper still sees the size list and can judge).
export function productHasSize(sizesCsv: string | null, requested: MonthRange): boolean {
  const ranges = productSizeRanges(sizesCsv);
  if (ranges.length > 0) return ranges.some((r) => rangesOverlap(r, requested));

  // Nothing on the age scale. If any label here is recognisably a shoe
  // size, the product is sized by foot, not age, and excluding it is
  // right -- the fallback below would otherwise have it match every age
  // there is. Genuinely unreadable sizing (a bare "OS") still passes.
  const labels = (sizesCsv ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (labels.some(isShoeSizeLabel)) return false;

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
