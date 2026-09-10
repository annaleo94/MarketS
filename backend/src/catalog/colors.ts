import { tokenize } from "../scrapers/normalize";

// The colour vocabulary the catalogue is normalised to. Each entry lists
// the Hebrew forms a store might use in a title (masculine/feminine/plural
// and common synonyms) -- all of which collapse to the canonical name so a
// search for "לבן" also matches a title that says "לבנות".
const COLOR_FORMS: Record<string, string[]> = {
  לבן: ["לבן", "לבנה", "לבנים", "לבנות", "שמנת", "אוף-וויט"],
  שחור: ["שחור", "שחורה", "שחורים", "שחורות"],
  אפור: ["אפור", "אפורה", "אפורים", "אפורות", "מלאנז"],
  כחול: ["כחול", "כחולה", "כחולים", "כחולות", "נייבי", "תכלת"],
  ורוד: ["ורוד", "ורודה", "ורודים", "ורודות", "רוז"],
  אדום: ["אדום", "אדומה", "אדומים", "אדומות", "בורדו"],
  ירוק: ["ירוק", "ירוקה", "ירוקים", "ירוקות", "זית"],
  צהוב: ["צהוב", "צהובה", "צהובים", "צהובות"],
  חום: ["חום", "חומה", "חומים", "חומות", "קאמל", "בז"],
  קרם: ["קרם", "בז'", "בז׳", "נוד"],
  סגול: ["סגול", "סגולה", "סגולים", "סגולות", "לילך"],
  כתום: ["כתום", "כתומה", "כתומים", "כתומות"],
};

export const CANONICAL_COLORS = Object.keys(COLOR_FORMS);

const FORM_TO_CANONICAL = new Map<string, string>();
for (const [canonical, forms] of Object.entries(COLOR_FORMS)) {
  for (const form of forms) FORM_TO_CANONICAL.set(form, canonical);
}

// Reads a colour straight off the product title when the store states one.
// Free and exact, so it's always tried before spending a vision call.
//
// Careful with Hebrew ambiguity: "לבנות" is both "white (pl.)" and
// "for girls". Treating it as a colour is right far more often than not
// for garment titles, and a wrong guess here only affects ranking -- the
// matching model still sees the full title and can disagree.
export function colorFromTitle(title: string): string | null {
  for (const token of tokenize(title)) {
    const canonical = FORM_TO_CANONICAL.get(token);
    if (canonical) return canonical;
  }
  return null;
}

// Maps whatever a vision model replies with onto the vocabulary above,
// so the stored value is always one of CANONICAL_COLORS (or nothing).
export function normalizeColorName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const direct = FORM_TO_CANONICAL.get(raw.trim());
  if (direct) return direct;
  return colorFromTitle(raw);
}
