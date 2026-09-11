import { useState } from "react";
import { SearchResponse, AppliedFilter, compareForDisplay, matchRank } from "../api";
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
  // request. Items whose colour or leg style we never resolved are excluded
  // too: they sort below the confirmed matches, so the cheapest of them is
  // typically collapsed behind "הצג עוד" and the badge would be attached to
  // a card nobody can see -- which is how a search for a white shirt ended
  // up showing no "הכי זול" at all, its ₪19.9 winner being a shirt of
  // unknown colour sitting out of view.
  // Narrowed to the best combined tier actually present, not just to "not
  // wrong": every store lists that tier first, so whichever item wins the
  // badge is certain to be on screen rather than collapsed behind "הצג עוד".
  const bestRank = allItems.length > 0 ? Math.min(...allItems.map(matchRank)) : null;
  const priced = allItems.filter((i) => matchRank(i) === bestRank);
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
          לא נמצא פריט שעונה בדיוק על מה שביקשתם (צבע ו/או רגליות). אלה הפריטים הקרובים ביותר.
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
