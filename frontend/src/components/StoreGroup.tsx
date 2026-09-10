import { useState } from "react";
import { StoreResults } from "../api";
import { ProductCard } from "./ProductCard";

const INITIAL_VISIBLE = 6;

export function StoreGroup({ group, cheapestOverall }: { group: StoreResults; cheapestOverall: number | null }) {
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

  const visible = expanded ? group.items : group.items.slice(0, INITIAL_VISIBLE);

  return (
    <section className="store-group">
      <h2 className="store-group__head">
        {group.store.name} <span className="store-group__count">({group.count})</span>
      </h2>

      <ul className="store-group__items">
        {visible.map((item) => (
          <ProductCard key={item.id} item={item} isCheapest={item.price === cheapestOverall} />
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
