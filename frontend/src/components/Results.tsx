import { useState } from "react";
import { SearchResponse, AppliedFilter, compareForDisplay } from "../api";
import { StoreGroup } from "./StoreGroup";
import { ProductCard } from "./ProductCard";

interface Props {
  data: SearchResponse;
  onDropFilter: (kind: AppliedFilter["kind"]) => void;
}

export function Results({ data, onDropFilter }: Props) {
  const [flat, setFlat] = useState(false);

  const allItems = data.stores.flatMap((s) => s.items);

  // "Cheapest" has to mean cheapest among the items that actually answer the
  // request -- badging a grey bodysuit as the best price in a search for a
  // white shirt would be worse than not badging anything at all.
  const onTarget = allItems.filter((i) => i.colorMatch !== "other");
  const priced = onTarget.length > 0 ? onTarget : allItems;
  const cheapestOverall = priced.length > 0 ? Math.min(...priced.map((i) => i.price)) : null;

  return (
    <div className="results">
      {data.filters.length > 0 && (
        <div className="filters">
          <span className="filters__label">סוננו לפי:</span>
          {data.filters.map((filter) => (
            <button
              key={filter.kind}
              className="chip"
              onClick={() => onDropFilter(filter.kind)}
              title="הסרת הסינון"
            >
              {filter.label} <span className="chip__x">✕</span>
            </button>
          ))}
        </div>
      )}

      <div className="results__bar">
        <span>
          {data.totalCount} תוצאות עבור "{data.query}"
        </span>
        <button className="results__toggle" onClick={() => setFlat(!flat)}>
          {flat ? "קיבוץ לפי חנות" : "השוואה לפי מחיר"}
        </button>
      </div>

      {data.showingAlternatives && data.totalCount > 0 && (
        <p className="notice">
          לא נמצא פריט בצבע שביקשתם. אלה הפריטים הקרובים ביותר, בצבעים אחרים.
        </p>
      )}

      {data.totalCount === 0 && (
        <p className="empty-state">
          לא נמצאו פריטים שעונים על כל התנאים. אפשר להסיר סינון למעלה כדי להרחיב את החיפוש.
        </p>
      )}

      {flat ? (
        <ul className="store-group__items">
          {[...allItems]
            .sort(compareForDisplay)
            .map((item) => (
              <ProductCard key={item.id} item={item} isCheapest={item.price === cheapestOverall} />
            ))}
        </ul>
      ) : (
        data.stores.map((group) => (
          <StoreGroup key={group.store.key} group={group} cheapestOverall={cheapestOverall} />
        ))
      )}
    </div>
  );
}
