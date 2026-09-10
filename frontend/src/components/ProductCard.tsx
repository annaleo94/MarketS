import { SearchResultItem } from "../api";

const currencySymbol: Record<string, string> = { ILS: "₪", USD: "$", EUR: "€" };

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
        {item.sizes && <div className="product__meta">מידות: {item.sizes.split(",").join(" · ")}</div>}
        {item.color && <div className="product__meta">צבע: {item.color}</div>}
      </div>

      <div className="product__buy">
        {isCheapest && <span className="badge badge--cheapest">הכי זול</span>}
        <div className="product__price">
          {symbol}
          {item.price.toLocaleString("he-IL")}
        </div>
        <a className="product__link" href={item.url} target="_blank" rel="noopener noreferrer">
          לצפייה בחנות ←
        </a>
      </div>
    </li>
  );
}
