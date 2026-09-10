import { SearchResultItem } from "../api";
import { StoreRow } from "./StoreRow";

interface Props {
  results: SearchResultItem[];
  query: string;
}

export function ResultsList({ results, query }: Props) {
  if (results.length === 0) {
    return (
      <div className="empty-state">
        <p>
          לא נמצאו חנויות שמוכרות "{query}". נסה/י מונח חיפוש אחר (למשל שם מוצר או מותג).
        </p>
      </div>
    );
  }

  const cheapest = results[0].price;

  return (
    <div className="results">
      <div className="results__summary">
        נמצאו {results.length} חנויות עבור "{query}" — ממוין מהזול ליקר
      </div>
      <ul className="results__list">
        {results.map((item, i) => (
          <StoreRow key={item.store.key} item={item} rank={i + 1} isCheapest={item.price === cheapest} />
        ))}
      </ul>
    </div>
  );
}
