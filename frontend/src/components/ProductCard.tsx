import { SearchResultItem } from "../api";

const currencySymbol: Record<string, string> = { ILS: "₪", USD: "$", EUR: "€" };

// Kept deliberately sparse: title, the sizes actually in stock, and the
// price -- everything else the server knows about an item (colour, leg
// style, store gender...) drives matching and sort order but isn't text
// the shopper needs to read on every single card.
export function ProductCard({ item, isCheapest }: { item: SearchResultItem; isCheapest: boolean }) {
  const symbol = currencySymbol[item.currency] ?? item.currency;

  return (
    <li className={`product${isCheapest ? " product--cheapest" : ""}`}>
      {item.imageUrl ? (
        <img className="product__image" src={item.imageUrl} alt="" loading="lazy" />
      ) : (
        <div className="product__image product__image--empty" />
      )}

      <div className="product__body">
        <div className="product__title">{item.title}</div>
        {item.sizes && <div className="product__meta">{item.sizes.split(",").join(" · ")}</div>}
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
