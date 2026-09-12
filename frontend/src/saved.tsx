import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";

// The saved list ("הסל"). Deliberately not a shopping cart: nothing is
// ever bought here, the purchase happens on the store's own site. What a
// shopper actually wants from it is "put this aside and tell me if the
// price moves", so an entry keeps the price it had when it was saved --
// that snapshot is the only thing that makes "ירד ₪12 מאז ששמרת"
// answerable later.
export interface SavedItem {
  id: string;
  title: string;
  price: number; // as it was at the moment it was saved
  currency: string;
  url: string;
  imageUrl: string | null;
  sizes: string | null;
  storeKey: string;
  storeName: string;
  savedAt: string;
}

// What the catalogue says about that item now (GET /api/products).
export interface LiveProduct {
  id: string;
  title: string;
  price: number;
  currency: string;
  url: string;
  imageUrl: string | null;
  inStock: boolean;
  sizes: string | null;
  listPrice: number | null;
  lowestPrice: number | null;
  delisted: boolean;
  store: { key: string; name: string; baseUrl: string; logoUrl: string | null };
}

const STORAGE_KEY = "markets.saved.v1";

// There are no accounts, so the list lives in the shopper's own browser.
// Every read and write is guarded: in a private window, or with site data
// blocked, localStorage throws rather than returning empty, and a saved
// list failing must never take the whole page down with it.
function load(): SavedItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((i) => i && typeof i.id === "string") : [];
  } catch {
    return [];
  }
}

function save(items: SavedItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Out of quota or storage blocked -- the list still works for this
    // visit, it just won't be there next time. Not worth an error to the
    // shopper mid-browse.
  }
}

interface SavedContextValue {
  items: SavedItem[];
  live: Record<string, LiveProduct>;
  isSaved: (id: string) => boolean;
  toggle: (item: SavedItem) => void;
  remove: (id: string) => void;
  clear: () => void;
  refresh: () => void;
  refreshedAt: Date | null;
}

const SavedContext = createContext<SavedContextValue | null>(null);

export function SavedProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<SavedItem[]>(load);
  const [live, setLive] = useState<Record<string, LiveProduct>>({});
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const inFlight = useRef(false);

  useEffect(() => save(items), [items]);

  // Asks the catalogue what the saved items look like now. Called on load
  // and whenever the panel is opened, so the prices a shopper comes back
  // to are the current ones rather than the ones their browser froze.
  const refresh = useCallback(() => {
    const ids = load().map((i) => i.id);
    if (ids.length === 0 || inFlight.current) return;
    inFlight.current = true;

    fetch(`/api/products?ids=${encodeURIComponent(ids.join(","))}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((body: { products: LiveProduct[] }) => {
        setLive(Object.fromEntries(body.products.map((p) => [p.id, p])));
        setRefreshedAt(new Date());
      })
      .catch(() => {
        // Offline, or the API is down. The snapshot each entry carries is
        // still shown -- a saved list that renders stale prices beats one
        // that renders nothing.
      })
      .finally(() => {
        inFlight.current = false;
      });
  }, []);

  useEffect(() => refresh(), [refresh]);

  const value = useMemo<SavedContextValue>(
    () => ({
      items,
      live,
      refreshedAt,
      refresh,
      isSaved: (id) => items.some((i) => i.id === id),
      toggle: (item) =>
        setItems((prev) =>
          prev.some((i) => i.id === item.id) ? prev.filter((i) => i.id !== item.id) : [item, ...prev]
        ),
      remove: (id) => setItems((prev) => prev.filter((i) => i.id !== id)),
      clear: () => setItems([]),
    }),
    [items, live, refreshedAt, refresh]
  );

  return <SavedContext.Provider value={value}>{children}</SavedContext.Provider>;
}

export function useSaved(): SavedContextValue {
  const ctx = useContext(SavedContext);
  if (!ctx) throw new Error("useSaved must be used inside <SavedProvider>");
  return ctx;
}

// --- what changed since it was saved ---------------------------------
// One place decides what a saved row says, so the wording can't drift
// between the panel and anywhere else it's shown later.
export type SavedStatusTone = "good" | "warn" | "bad" | "info";
export interface SavedStatus {
  tone: SavedStatusTone;
  label: string;
}

const AGORA = 0.005;

export function savedStatuses(item: SavedItem, current: LiveProduct | undefined): SavedStatus[] {
  if (!current) return [];
  const out: SavedStatus[] = [];

  if (current.delisted) return [{ tone: "bad", label: "כבר לא מופיע בחנות" }];
  if (!current.inStock) out.push({ tone: "bad", label: "אזל מהמלאי" });

  const delta = current.price - item.price;
  if (delta < -AGORA) out.push({ tone: "good", label: `ירד ב-₪${fmt(-delta)} מאז ששמרתם` });
  else if (delta > AGORA) out.push({ tone: "warn", label: `עלה ב-₪${fmt(delta)} מאז ששמרתם` });

  // The store's own "before" price, not a drop we inferred -- so this says
  // the store is running a sale, which is a different claim from "cheaper
  // than when you saved it" and can be true without it.
  if (current.listPrice && current.listPrice > current.price + AGORA) {
    out.push({ tone: "good", label: `במבצע · במקום ₪${fmt(current.listPrice)}` });
  }

  // Only worth saying when it's news: a price that never moved is trivially
  // also the lowest we've seen, and labelling that would make the badge
  // meaningless everywhere it appears.
  if (
    current.lowestPrice !== null &&
    current.price <= current.lowestPrice + AGORA &&
    current.price < item.price - AGORA
  ) {
    out.push({ tone: "good", label: "המחיר הכי נמוך שראינו" });
  }

  return out;
}

// "1 פריטים" is wrong Hebrew, and the count is on screen in three places.
export function itemCount(n: number): string {
  return n === 1 ? "פריט אחד" : `${n} פריטים`;
}

export function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}
