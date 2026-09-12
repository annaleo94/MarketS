import { SearchResultItem } from "../api";
import { SaveToggle } from "./SaveToggle";

const currencySymbol: Record<string, string> = { ILS: "₪", USD: "$", EUR: "€" };

export interface CardStore {
  key: string;
  name: string;
}

// Kept deliberately sparse: title, the sizes actually in stock, and the
// price -- everything else the server knows about an item (colour, leg
// style, store gender...) drives matching and sort order but isn't text
// the shopper needs to read on every single card.
export function ProductCard({
  item,
  isCheapest,
  store,
  showStore = false,
}: {
  item: SearchResultItem;
  isCheapest: boolean;
  store: CardStore;
  // Only in the merged "compare by price" list, where the cards aren't
  // under a store heading -- a price with no shop attached to it can't be
  // compared against anything.
  showStore?: boolean;
}) {
  const symbol = currencySymbol[item.currency] ?? item.currency;

  return (
    <li className={`product${isCheapest ? " product--cheapest" : ""}`}>
      <SaveToggle item={item} store={store} />

      {item.imageUrl ? (
        <img className="product__image" src={item.imageUrl} alt="" loading="lazy" />
      ) : (
        <div className="product__image product__image--empty" />
      )}

      <div className="product__body">
        <div className="product__title">{item.title}</div>
        {(showStore || item.sizes) && (
          <div className="product__meta">
            {showStore && <span className="product__store">{store.name}</span>}
            {item.sizes && item.sizes.split(",").join(" · ")}
          </div>
        )}
      </div>

      <div className="product__buy">
        {(item.colorMatch === "other" || item.legStyleMatch === "other") && (
          <span className="badge badge--alternative">חלופה קרובה</span>
        )}
        {isCheapest && <span className="badge badge--cheapest">הכי זול</span>}
        <div className="product__price">
          {symbol}
          {item.price.toLocaleString("he-IL")}
        </div>
        <a className="product__link" href={item.url} target="_blank" rel="noopener noreferrer">
          לחנות ←
        </a>
      </div>
    </li>
  );
}
