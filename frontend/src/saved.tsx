import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";

// The saved list ("השמורים שלי"). Deliberately not a shopping cart, and
// not named like one: a cart assumes buying now, from one store, with the
// decision already made. Here none of the three holds -- most saves are
// to watch a price or to compare across stores, and the purchase itself
// happens on the store's own site. So there is no quantity, no total, and
// no single checkout; what there is instead is a status per item that
// keeps itself up to date.
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
  // Which of the shopper's own lists this belongs to ("לחג", "לדנה"...).
  listName: string;
}

export const DEFAULT_LIST = "השמורים שלי";

// The catalogue's current view of a saved product (GET /api/products).
// displayStatus is computed by the sync and stored, not worked out here
// -- someone who hasn't opened the site for a week has to find it already
// correct, and only the sync knows the store's feed moved.
export type DisplayStatus =
  | "in_stock_unchanged"
  | "price_dropped"
  | "out_of_stock"
  | "on_sale"
  | "back_in_stock";

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
  previousPrice: number | null;
  displayStatus: DisplayStatus;
  statusChangedAt: string | null;
  color: string | null;
  colors: string[];
  gender: string;
  delisted: boolean;
  store: { key: string; name: string; nameEn: string | null; baseUrl: string; logoUrl: string | null };
}

const STORAGE_KEY = "markets.saved.v1";
// List names are kept separately from the items so a list can exist while
// still empty -- someone creates "לחג" first and fills it afterwards, and
// a tab that vanished the moment it was created would be baffling.
const LISTS_KEY = "markets.saved.lists.v1";

// There are no accounts, so the list lives in the shopper's own browser.
// Every read and write is guarded: in a private window, or with site data
// blocked, localStorage throws rather than returning empty, and a saved
// list failing must never take the whole page down with it.
function load(): SavedItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((i) => i && typeof i.id === "string")
      // Items saved before named lists existed have no listName; they
      // belong in the default list rather than in a list called
      // "undefined".
      .map((i: SavedItem) => ({ ...i, listName: i.listName || DEFAULT_LIST }));
  } catch {
    return [];
  }
}

function loadLists(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(LISTS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((n) => typeof n === "string" && n !== DEFAULT_LIST) : [];
  } catch {
    return [];
  }
}

function saveLists(names: string[]): void {
  try {
    localStorage.setItem(LISTS_KEY, JSON.stringify(names));
  } catch {
    // Same as above: losing this only costs the empty tabs, not the items.
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
  lists: string[];
  createList: (name: string) => void;
  isSaved: (id: string) => boolean;
  toggle: (item: Omit<SavedItem, "listName">, listName?: string) => void;
  remove: (id: string) => void;
  moveToList: (id: string, listName: string) => void;
  clear: (listName?: string) => void;
  refresh: () => void;
  refreshedAt: Date | null;
}

const SavedContext = createContext<SavedContextValue | null>(null);

export function SavedProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<SavedItem[]>(load);
  const [live, setLive] = useState<Record<string, LiveProduct>>({});
  const [customLists, setCustomLists] = useState<string[]>(loadLists);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const inFlight = useRef(false);

  useEffect(() => save(items), [items]);
  useEffect(() => saveLists(customLists), [customLists]);

  // Asks the catalogue what the saved items look like now. The status
  // badge itself is already decided server-side; this is what brings it,
  // and the current price, to the screen.
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

  // The default list always exists, even when empty, so there is
  // somewhere for the first save to land and something to show as the
  // active tab.
  const lists = useMemo(
    () => [...new Set([DEFAULT_LIST, ...customLists, ...items.map((i) => i.listName)])],
    [items, customLists]
  );

  const value = useMemo<SavedContextValue>(
    () => ({
      items,
      live,
      lists,
      refreshedAt,
      refresh,
      createList: (name) =>
        setCustomLists((prev) => (name === DEFAULT_LIST || prev.includes(name) ? prev : [...prev, name])),
      isSaved: (id) => items.some((i) => i.id === id),
      toggle: (item, listName = DEFAULT_LIST) =>
        setItems((prev) =>
          prev.some((i) => i.id === item.id)
            ? prev.filter((i) => i.id !== item.id)
            : [{ ...item, listName }, ...prev]
        ),
      remove: (id) => setItems((prev) => prev.filter((i) => i.id !== id)),
      moveToList: (id, listName) =>
        setItems((prev) => prev.map((i) => (i.id === id ? { ...i, listName } : i))),
      // Scoped to one list by default: clearing "לחג" must not take
      // everything else with it.
      clear: (listName) =>
        setItems((prev) => (listName ? prev.filter((i) => i.listName !== listName) : [])),
    }),
    [items, live, lists, refreshedAt, refresh]
  );

  return <SavedContext.Provider value={value}>{children}</SavedContext.Provider>;
}

export function useSaved(): SavedContextValue {
  const ctx = useContext(SavedContext);
  if (!ctx) throw new Error("useSaved must be used inside <SavedProvider>");
  return ctx;
}

// --- the badge on a saved row ----------------------------------------
// One place decides what a row says, so the wording can't drift between
// the list and the comparison view.
export type SavedStatusTone = "good" | "warn" | "bad" | "info";
export interface SavedStatus {
  tone: SavedStatusTone;
  label: string;
}

const AGORA = 0.005;

// The headline badge: exactly one, matching the stored displayStatus,
// except that a drop is reported against the price THIS shopper saved
// when that's known -- "ירד מ-₪89 ל-₪60" is only meaningful next to the
// number they remember.
export function primaryStatus(item: SavedItem, current: LiveProduct | undefined): SavedStatus | null {
  if (!current) return null;
  if (current.delisted) return { tone: "bad", label: "כבר לא מופיע בחנות" };

  // Nothing is promised that can't be delivered: there are no accounts
  // and no notifications yet, so the item is kept in the list and marked
  // here when it returns, rather than claiming we'll tell them.
  if (current.displayStatus === "out_of_stock" || !current.inStock) {
    return { tone: "bad", label: "אזל — יסומן כאן כשיחזור" };
  }

  const from = item.price > current.price + AGORA ? item.price : current.previousPrice;
  if (current.displayStatus === "price_dropped" || item.price > current.price + AGORA) {
    return from !== null && from > current.price + AGORA
      ? { tone: "good", label: `ירד מ-₪${fmt(from)} ל-₪${fmt(current.price)}` }
      : { tone: "good", label: "ירד במחיר" };
  }

  if (current.displayStatus === "back_in_stock") return { tone: "good", label: "חזר למלאי" };
  if (current.displayStatus === "on_sale") {
    return current.listPrice
      ? { tone: "good", label: `במבצע עכשיו 🔖 · במקום ₪${fmt(current.listPrice)}` }
      : { tone: "good", label: "במבצע עכשיו 🔖" };
  }
  return null; // in_stock_unchanged -- no badge, just the current price
}

// Extra context, shown under the headline badge. Not part of the status
// itself: these are things worth knowing while tracking a price, and a
// rise in particular is exactly what someone watching an item wants to
// be told even though it isn't one of the five states.
export function secondaryStatuses(item: SavedItem, current: LiveProduct | undefined): SavedStatus[] {
  if (!current || current.delisted) return [];
  const out: SavedStatus[] = [];

  if (current.price > item.price + AGORA) {
    out.push({ tone: "warn", label: `עלה מ-₪${fmt(item.price)} מאז ששמרתם` });
  }

  // A sale that also cut the price: the headline says how far it fell, so
  // this adds the fact that the store is calling it a sale.
  if (current.displayStatus === "price_dropped" && current.listPrice && current.listPrice > current.price + AGORA) {
    out.push({ tone: "good", label: `במבצע 🔖 · במקום ₪${fmt(current.listPrice)}` });
  }

  if (
    current.inStock &&
    current.lowestPrice !== null &&
    current.price <= current.lowestPrice + AGORA &&
    current.price < item.price - AGORA
  ) {
    out.push({ tone: "info", label: "המחיר הכי נמוך שראינו" });
  }

  return out;
}

// "1 פריטים" is wrong Hebrew, and the count is on screen in several places.
export function itemCount(n: number): string {
  return n === 1 ? "פריט אחד" : `${n} פריטים`;
}

export function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}
