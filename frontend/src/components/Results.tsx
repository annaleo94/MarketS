import { SearchResponse } from "../api";
import { StoreGroup } from "./StoreGroup";

interface Props {
  data: SearchResponse;
}

// Results, grouped by store, cheapest first within each one. Two things
// deliberately absent:
//
// The "סוננו לפי" chips. How the query was parsed -- category, size,
// gender -- is our working, not the shopper's business; someone who typed
// "מכנס קצר ורוד" already knows what they asked for, and seeing it
// restated as machine-looking tags invites doubt about whether we
// understood rather than confidence that we did.
//
// The "השוואה לפי מחיר" toggle. Every store's list is already ordered
// cheapest to priciest, so the toggle offered a different arrangement of
// the same order -- a choice that costs a decision and changes nothing.
export function Results({ data }: Props) {
  return (
    <div className="results">
      <div className="results__bar">
        <span>
          {data.totalCount} תוצאות עבור "{data.query}"
        </span>
      </div>

      {data.showingAlternatives && data.totalCount > 0 && (
        <p className="notice">
          לא נמצא פריט שעונה בדיוק על מה שביקשתם (צבע ו/או רגליות). אלה הפריטים הקרובים ביותר.
        </p>
      )}

      {data.totalCount === 0 && (
        <p className="empty-state">
          לא נמצאו פריטים שמתאימים לחיפוש. אפשר לנסות ניסוח אחר, או לוותר על אחד הפרטים — למשל הצבע או
          המידה.
        </p>
      )}

      {data.stores.map((group) => (
        <StoreGroup key={group.store.key} group={group} />
      ))}
    </div>
  );
}
