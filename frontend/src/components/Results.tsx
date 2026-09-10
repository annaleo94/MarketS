import { useState } from "react";
import { SearchResponse, AppliedFilter } from "../api";
import { StoreGroup } from "./StoreGroup";
import { ProductCard } from "./ProductCard";

interface Props {
  data: SearchResponse;
  onDropFilter: (kind: AppliedFilter["kind"]) => void;
}

export function Results({ data, onDropFilter }: Props) {
  const [flat, setFlat] = useState(false);

  const allItems = data.stores.flatMap((s) => s.items);
  const cheapestOverall = allItems.length > 0 ? Math.min(...allItems.map((i) => i.price)) : null;

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

      {data.totalCount === 0 && (
        <p className="empty-state">
          לא נמצאו פריטים שעונים על כל התנאים. אפשר להסיר סינון למעלה כדי להרחיב את החיפוש.
        </p>
      )}

      {flat ? (
        <ul className="store-group__items">
          {[...allItems]
            .sort((a, b) => a.price - b.price)
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
