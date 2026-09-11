// The canonical category tree. Stores each name garments their own way --
// "בגד ים", "ביקיני", "מכנס שחייה" and "חליפת שמש" are all swimwear -- so
// everything is mapped onto these slugs at ingest, and a search for a
// parent (swimwear) returns every descendant. Without the tree, asking for
// a swimsuit silently misses the swim shorts.

export interface CategoryNode {
  slug: string;
  label: string; // Hebrew, shown to the shopper
  parent?: string;
  // Words that identify this category in a product title or a search.
  aliases: string[];
}

export const CATEGORIES: CategoryNode[] = [
  // --- swimwear ---
  { slug: "swimwear", label: "בגדי ים", aliases: ["בגד ים", "בגדי ים", "שחייה", "swimwear"] },
  { slug: "swimsuit", label: "בגד ים שלם", parent: "swimwear", aliases: ["בגד ים שלם", "בגד-ים שלם", "מונוקיני"] },
  { slug: "bikini", label: "ביקיני", parent: "swimwear", aliases: ["ביקיני", "דו חלקי", "טנקיני"] },
  { slug: "swim-shorts", label: "מכנסי שחייה", parent: "swimwear", aliases: ["מכנס שחייה", "מכנסי שחייה", "בגד ים בנים"] },
  { slug: "uv-suit", label: "חליפת שמש", parent: "swimwear", aliases: ["חליפת שמש", "uv", "הגנה מהשמש"] },
  { slug: "swim-diaper", label: "חיתול ים", parent: "swimwear", aliases: ["חיתול ים", "חיתול שחייה"] },

  // --- tops ---
  { slug: "tops", label: "חולצות", aliases: ["חולצה", "חולצות", "טישרט", "top"] },
  // "שרוול קצר"/"שרוול ארוך" (short-/long-sleeved) used to be aliases here
  // too, but a sleeve length describes ANY garment, not specifically a
  // shirt: of every title in the catalogue that names a sleeve length
  // without also naming a shirt, 9 of 10 were actually bodysuits, a dress
  // or swimwear -- "בגד גוף ריב עם שרוול קצר" is a short-sleeved bodysuit,
  // not a shirt, and used to be filed as one.
  { slug: "shirt-short", label: "חולצה קצרה", parent: "tops", aliases: ["חולצה קצרה", "טישרט"] },
  { slug: "shirt-long", label: "חולצה ארוכה", parent: "tops", aliases: ["חולצה ארוכה"] },
  { slug: "tank", label: "גופייה", parent: "tops", aliases: ["גופיה", "גופייה", "מיקרו"] },

  // A bodysuit is its own top-level category, not a child of tops: it used
  // to be nested there, which meant a plain "חולצה" search silently pulled
  // in every bodysuit too (tops's own descendant list included it) and a
  // shopper couldn't search for one without the other. As a sibling, each
  // stays exactly what it says.
  { slug: "bodysuit", label: "בגד גוף", aliases: ["בגד גוף", "בגדי גוף", "אוברול קצר"] },

  // --- bottoms ---
  { slug: "bottoms", label: "מכנסיים וחצאיות", aliases: ["מכנס", "מכנסיים", "תחתון"] },
  { slug: "shorts", label: "מכנסיים קצרים", parent: "bottoms", aliases: ["מכנסיים קצרים", "מכנס קצר", "שורט"] },
  // "ג'ינס"/"גינס" bare is a fabric ("denim"), not a garment -- it showed
  // up on jean jackets, shirts, dresses and skirts too, all mistagged as
  // pants. Only the compound phrases that actually name jeans-the-pants
  // are aliases here; a jean jacket still matches "ג'קט" (outerwear), a
  // denim skirt "חצאית" (skirt), each via its own node.
  { slug: "pants", label: "מכנסיים ארוכים", parent: "bottoms", aliases: ["מכנסיים ארוכים", "מכנס ארוך", "מכנסי ג'ינס", "מכנס ג'ינס", "מכנסי גינס", "מכנס גינס"] },
  { slug: "leggings", label: "טייצים", parent: "bottoms", aliases: ["טייץ", "טייצים", "רגליות"] },
  { slug: "skirt", label: "חצאיות", parent: "bottoms", aliases: ["חצאית", "חצאיות"] },

  // --- whole-body ---
  { slug: "dress", label: "שמלות", aliases: ["שמלה", "שמלות"] },
  { slug: "overall", label: "אוברולים וסרבלים", aliases: ["אוברול", "אוברולים", "סרבל", "סרבלים", "חליפה"] },
  { slug: "set", label: "סטים ומארזים", aliases: ["סט", "סטים", "מארז", "מארזי", "חלקים"] },

  // --- outer / sleep ---
  { slug: "outerwear", label: "מעילים וסריגים", aliases: ["מעיל", "פוטר", "קפוצון", "סריג", "קרדיגן", "ג'קט", "אפודה", "וסט"] },
  { slug: "sleepwear", label: "ביגוד שינה", aliases: ["פיג'מה", "פיגמה", "ביגוד שינה", "שק שינה", "אוברול שינה"] },

  // --- extras ---
  { slug: "shoes", label: "הנעלה", aliases: ["נעל", "נעלי", "סנדל", "מגף", "כפכף"] },

  // Same shape as swimwear and bottoms above: one parent so a generic
  // "אביזרים" still finds all of these, and one child per kind so each is
  // its own filterable category instead of one bucket a search for socks
  // or hats couldn't tell apart. This used to be a single flat node with
  // every alias below on it directly -- searching for a hat surfaced
  // socks, belts, gloves and everything else in the drawer alongside it.
  { slug: "accessories", label: "אביזרים", aliases: ["אביזר", "אביזרים"] },
  { slug: "socks", label: "גרביים", parent: "accessories", aliases: ["גרביים", "גרב"] },
  {
    slug: "tights",
    label: "גרביונים",
    parent: "accessories",
    aliases: ["גרביון", "גרביונים"],
  },
  { slug: "hats", label: "כובעים", parent: "accessories", aliases: ["כובע", "כובעים"] },
  { slug: "belts", label: "חגורות", parent: "accessories", aliases: ["חגורה", "חגורות"] },
  {
    slug: "hair-accessories",
    label: "אביזרי שיער",
    parent: "accessories",
    aliases: ["גומייה", "גומיות", "גומיית שיער", "גומיות שיער", "סיכת שיער", "סיכות שיער", "קליפס", "אביזרי שיער"],
  },
  { slug: "scarves", label: "צעיפים", parent: "accessories", aliases: ["צעיף", "צעיפים"] },
  { slug: "gloves", label: "כפפות", parent: "accessories", aliases: ["כפפה", "כפפות"] },
  { slug: "bibs", label: "סינרים", parent: "accessories", aliases: ["סינר", "סינרים"] },
  { slug: "cloth-diapers", label: "חיתולי בד", parent: "accessories", aliases: ["חיתול בד", "חיתולי בד"] },
];

const BY_SLUG = new Map(CATEGORIES.map((c) => [c.slug, c]));

// Every descendant of `slug`, including itself -- what a search for a
// parent category has to look for.
export function categoryWithDescendants(slug: string): string[] {
  const result = [slug];
  for (const node of CATEGORIES) {
    if (node.parent === slug) result.push(...categoryWithDescendants(node.slug));
  }
  return result;
}

export function categoryLabel(slug: string): string {
  return BY_SLUG.get(slug)?.label ?? slug;
}

export function isKnownCategory(slug: string): boolean {
  return BY_SLUG.has(slug);
}

// Best-effort read of a category straight from a title or a store's own
// category string. Longer aliases are tried first so "חולצה ארוכה" wins
// over the bare "חולצה", and child categories are preferred over parents.
// "רגליות" names the leggings product ("שלישיית רגליות") -- but the exact
// same word, in "עם רגליות" / "ללא רגליות" / "בלי רגליות", describes
// whether a DIFFERENT garment (an overall, a onesie) has integrated feet.
// "אוברול ארוך דינוזאורים ללא רגליות" is an overall, not a pair of
// leggings; matching it as one put it in front of every leggings search
// and dropped it out of every overall one. Checked before the general
// substring match below, which has no way to tell the two apart itself.
const LEGGINGS_CUT_DESCRIPTOR = /(עם|ללא|בלי)\s+רגליות/;

// Categories where "with/without built-in feet" is a real, filterable
// attribute (see Product.legStyle) -- overalls and long pants specifically,
// not shorts/skirts/leggings, matching what was actually asked for.
export const LEG_STYLE_CATEGORIES = ["overall", "pants", "bottoms"];

// Reads leg style straight off a title when the store or listing states it
// outright ("אוברול ארוך דינוזאורים ללא רגליות"). Free and exact, tried
// before spending a vision call -- see catalog/enrich-leg-style.ts.
export function legStyleFromText(text: string): "footed" | "footless" | null {
  const match = text.match(LEGGINGS_CUT_DESCRIPTOR);
  if (!match) return null;
  return match[1] === "עם" ? "footed" : "footless";
}

export function categoryFromText(text: string): string | null {
  const haystack = text.toLowerCase();

  const candidates = CATEGORIES.flatMap((node) =>
    node.aliases.map((alias) => ({ slug: node.slug, alias: alias.toLowerCase(), isChild: Boolean(node.parent) }))
  ).sort((a, b) => b.alias.length - a.alias.length || Number(b.isChild) - Number(a.isChild));

  for (const { slug, alias } of candidates) {
    if (alias === "רגליות" && LEGGINGS_CUT_DESCRIPTOR.test(haystack)) continue;
    if (haystack.includes(alias)) return slug;
  }
  return null;
}
