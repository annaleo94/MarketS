import { useState } from "react";
import { StoreResults, matchRank } from "../api";
import { ProductCard } from "./ProductCard";

const INITIAL_VISIBLE = 6;

export function StoreGroup({ group }: { group: StoreResults }) {
  const [expanded, setExpanded] = useState(false);

  // A store with nothing is still shown. Leaving it out would leave the
  // shopper unsure whether we searched there at all.
  if (group.count === 0) {
    return (
      <section className="store-group store-group--empty">
        <h2 className="store-group__head">
          {group.store.name} <span className="store-group__count">לא נמצאו תוצאות</span>
        </h2>
      </section>
    );
  }

  // Each store gets its own "cheapest" badge, not just whichever single
  // item is cheapest across all four stores combined -- a shopper
  // comparing Fox against Shilav wants to see each one's best price, not
  // just be told Shilav won and left wondering what Fox's own best was.
  // Same "best tier actually present" rule as before, just scoped to this
  // store's own items instead of the whole result set.
  const bestRank = Math.min(...group.items.map(matchRank));
  const cheapestInStore = Math.min(...group.items.filter((i) => matchRank(i) === bestRank).map((i) => i.price));

  const visible = expanded ? group.items : group.items.slice(0, INITIAL_VISIBLE);

  return (
    <section className="store-group">
      <h2 className="store-group__head">
        {group.store.name} <span className="store-group__count">({group.count})</span>
      </h2>

      <ul className="store-group__items">
        {visible.map((item) => (
          <ProductCard
            key={item.id}
            item={item}
            store={group.store}
            isCheapest={item.price === cheapestInStore}
          />
        ))}
      </ul>

      {group.count > INITIAL_VISIBLE && (
        <button className="store-group__more" onClick={() => setExpanded(!expanded)}>
          {expanded ? "הצג פחות" : `הצג עוד ${group.count - INITIAL_VISIBLE}`}
        </button>
      )}
    </section>
  );
}
