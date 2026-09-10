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
  { slug: "shirt-short", label: "חולצה קצרה", parent: "tops", aliases: ["חולצה קצרה", "טישרט", "שרוול קצר"] },
  { slug: "shirt-long", label: "חולצה ארוכה", parent: "tops", aliases: ["חולצה ארוכה", "שרוול ארוך"] },
  { slug: "tank", label: "גופייה", parent: "tops", aliases: ["גופיה", "גופייה", "מיקרו"] },
  { slug: "bodysuit", label: "בגד גוף", parent: "tops", aliases: ["בגד גוף", "בגדי גוף", "אוברול קצר"] },

  // --- bottoms ---
  { slug: "bottoms", label: "מכנסיים וחצאיות", aliases: ["מכנס", "מכנסיים", "תחתון"] },
  { slug: "shorts", label: "מכנסיים קצרים", parent: "bottoms", aliases: ["מכנסיים קצרים", "מכנס קצר", "שורט"] },
  { slug: "pants", label: "מכנסיים ארוכים", parent: "bottoms", aliases: ["מכנסיים ארוכים", "מכנס ארוך", "גינס", "ג'ינס"] },
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
  { slug: "accessories", label: "אביזרים", aliases: ["גרב", "גרביים", "כובע", "צעיף", "כפפות", "חיתול בד", "סינר"] },
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

// The chain above `slug`, nearest first. A product classified as plain
// "swimwear" isn't known not to be a swimsuit -- it only means nobody was
// more specific, which is the usual case when the category came from a
// store's own coarse label. So a search for a child that finds nothing can
// climb here rather than show an empty page.
export function categoryAncestors(slug: string): string[] {
  const chain: string[] = [];
  let node = BY_SLUG.get(slug);
  while (node?.parent) {
    chain.push(node.parent);
    node = BY_SLUG.get(node.parent);
  }
  return chain;
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
export function categoryFromText(text: string): string | null {
  const haystack = text.toLowerCase();

  const candidates = CATEGORIES.flatMap((node) =>
    node.aliases.map((alias) => ({ slug: node.slug, alias: alias.toLowerCase(), isChild: Boolean(node.parent) }))
  ).sort((a, b) => b.alias.length - a.alias.length || Number(b.isChild) - Number(a.isChild));

  for (const { slug, alias } of candidates) {
    if (haystack.includes(alias)) return slug;
  }
  return null;
}
