import { SearchResultItem } from "../api";

interface Props {
  item: SearchResultItem;
  rank: number;
  isCheapest: boolean;
}

const currencySymbol: Record<string, string> = { ILS: "₪", USD: "$", EUR: "€" };

export function StoreRow({ item, rank, isCheapest }: Props) {
  const symbol = currencySymbol[item.currency] ?? item.currency;

  return (
    <li className={`store-row${isCheapest ? " store-row--cheapest" : ""}`}>
      <div className="store-row__rank">{rank}</div>
      {item.imageUrl && <img className="store-row__image" src={item.imageUrl} alt="" />}
      <div className="store-row__info">
        <div className="store-row__store-name">
          {item.store.name}
          {isCheapest && <span className="badge badge--cheapest">הכי זול</span>}
          {!item.isExact && <span className="badge badge--alternative">חלופה קרובה</span>}
        </div>
        <div className="store-row__title">{item.title}</div>
        {item.matchReason && <div className="store-row__reason">{item.matchReason}</div>}
        <div className={`store-row__stock ${item.inStock ? "in-stock" : "out-of-stock"}`}>
          {item.inStock ? "במלאי" : "אזל מהמלאי"}
        </div>
      </div>
      <div className="store-row__price-col">
        <div className="store-row__price">
          {symbol}
          {item.price.toLocaleString("he-IL")}
        </div>
        <a className="store-row__link" href={item.url} target="_blank" rel="noopener noreferrer">
          לצפייה בחנות ←
        </a>
      </div>
    </li>
  );
}
