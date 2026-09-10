// Turns messy on-page price text ("₪1,299.90", "1299 ₪", "1,299") into a
// number. Returns null when nothing that looks like a price is found.
export function parsePrice(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d.,]/g, "");
  if (!cleaned) return null;

  const lastSep = Math.max(cleaned.lastIndexOf(","), cleaned.lastIndexOf("."));
  let normalized: string;

  if (lastSep !== -1 && cleaned.length - lastSep - 1 <= 2 && cleaned.length - lastSep - 1 >= 1) {
    // Looks like a decimal separator (1-2 digits follow it): keep it,
    // strip every other "," or "." as a thousands separator.
    const intPart = cleaned.slice(0, lastSep).replace(/[.,]/g, "");
    const decPart = cleaned.slice(lastSep + 1);
    normalized = `${intPart}.${decPart}`;
  } else {
    // No decimal part -- every "," or "." is a thousands separator.
    normalized = cleaned.replace(/[.,]/g, "");
  }

  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
}
