// Turns "what we had" + "what the store shows now" into a list of events
// worth recording and the summary fields to write back onto the product.
//
// Deliberately a pure function with no DB or network in it: the whole
// point of a price history is that it's trustworthy, so the rules that
// decide what counts as a price drop, a sale, or a restock are testable
// directly (see regression-tests.ts) rather than only observable by
// running a full sync against a live store.

export type ProductEventKind =
  | "listed"
  | "price-drop"
  | "price-rise"
  | "sale-start"
  | "sale-end"
  | "out-of-stock"
  | "back-in-stock"
  | "delisted"
  | "relisted";

export interface DetectedEvent {
  kind: ProductEventKind;
  oldPrice?: number;
  newPrice?: number;
  listPrice?: number;
}

// What we already had on file. Only the fields the diff actually reads.
export interface StoredProduct {
  price: number;
  inStock: boolean;
  listPrice: number | null;
  lowestPrice: number | null;
  highestPrice: number | null;
  delistedAt: Date | null;
}

// What the store is showing on this sync.
export interface ObservedProduct {
  price: number;
  inStock: boolean;
  listPrice?: number | null;
}

export interface ProductDiff {
  events: DetectedEvent[];
  // Summary columns to write onto Product alongside the usual fields.
  update: {
    listPrice: number | null;
    previousPrice?: number;
    priceChangedAt?: Date;
    lowestPrice: number;
    highestPrice: number;
    lastSeenAt: Date;
    delistedAt: Date | null;
  };
}

// Prices come back from stores as strings parsed to floats, so two "equal"
// prices can differ in the last bit. Anything under half an agora is the
// same price.
const PRICE_EPSILON = 0.005;

// A "before" price is only a sale if it is actually above what's being
// charged -- stores publish a compare_at_price equal to (or below) the
// real price often enough that treating any non-null value as a discount
// would call most of the catalogue "on sale".
function isSale(price: number, listPrice: number | null | undefined): boolean {
  return typeof listPrice === "number" && listPrice - price > PRICE_EPSILON;
}

export function diffProduct(stored: StoredProduct | null, observed: ObservedProduct, now: Date): ProductDiff {
  const listPrice = isSale(observed.price, observed.listPrice) ? observed.listPrice! : null;

  // Never seen before: one "listed" event, and the current price seeds
  // both ends of the range.
  if (!stored) {
    const events: DetectedEvent[] = [{ kind: "listed", newPrice: observed.price, listPrice: listPrice ?? undefined }];
    if (listPrice !== null) events.push({ kind: "sale-start", newPrice: observed.price, listPrice });
    return {
      events,
      update: {
        listPrice,
        priceChangedAt: now,
        lowestPrice: observed.price,
        highestPrice: observed.price,
        lastSeenAt: now,
        delistedAt: null,
      },
    };
  }

  const events: DetectedEvent[] = [];

  if (stored.delistedAt) {
    events.push({ kind: "relisted", newPrice: observed.price });
  }

  const priceDelta = observed.price - stored.price;
  const priceMoved = Math.abs(priceDelta) > PRICE_EPSILON;
  if (priceMoved) {
    events.push({
      kind: priceDelta < 0 ? "price-drop" : "price-rise",
      oldPrice: stored.price,
      newPrice: observed.price,
      listPrice: listPrice ?? undefined,
    });
  }

  // Sale state is tracked separately from the price moving: a store can
  // start advertising a "before" price without the price itself changing
  // (and a sale can end the same way), and that is exactly the "היה
  // במבצע" signal, so it earns its own event rather than being inferred.
  const wasOnSale = stored.listPrice !== null;
  const isOnSale = listPrice !== null;
  if (isOnSale && !wasOnSale) {
    events.push({ kind: "sale-start", newPrice: observed.price, listPrice });
  } else if (!isOnSale && wasOnSale) {
    events.push({ kind: "sale-end", newPrice: observed.price, listPrice: stored.listPrice ?? undefined });
  }

  // A relisted product is reported as back in stock by the relist event
  // itself; only a product that stayed listed gets a stock event, so a
  // single return doesn't write two near-identical rows.
  if (!stored.delistedAt && observed.inStock !== stored.inStock) {
    events.push({ kind: observed.inStock ? "back-in-stock" : "out-of-stock", newPrice: observed.price });
  }

  return {
    events,
    update: {
      listPrice,
      ...(priceMoved ? { previousPrice: stored.price, priceChangedAt: now } : {}),
      lowestPrice: Math.min(stored.lowestPrice ?? observed.price, observed.price),
      highestPrice: Math.max(stored.highestPrice ?? observed.price, observed.price),
      lastSeenAt: now,
      delistedAt: null,
    },
  };
}

// The other direction: a product we have that the store's feed no longer
// lists at all. Kept rather than deleted so its history survives and a
// later return can be recognised as one.
export function diffDelisted(stored: StoredProduct): DetectedEvent[] {
  if (stored.delistedAt) return []; // already known to be gone, not news
  return [{ kind: "delisted", oldPrice: stored.price }];
}
