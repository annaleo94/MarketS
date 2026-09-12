import { SavedItem, LiveProduct, fmt } from "../saved";

// Side-by-side comparison of a few saved items. This is the answer to
// "which of these is actually better", which a vertical list can't give:
// the same attribute has to sit on the same line across the columns for
// two prices or two size runs to be comparable at a glance.
//
// Material would belong here too, but no store in the catalogue publishes
// it in a machine-readable form, so the row is left out rather than shown
// empty for every product.
export function CompareView({
  items,
  live,
  onBack,
}: {
  items: SavedItem[];
  live: Record<string, LiveProduct>;
  onBack: () => void;
}) {
  const priceOf = (i: SavedItem) => live[i.id]?.price ?? i.price;
  const cheapest = Math.min(...items.map(priceOf));

  const rows: { label: string; render: (item: SavedItem) => React.ReactNode }[] = [
    { label: "חנות", render: (i) => i.storeName },
    {
      label: "מחיר",
      render: (i) => (
        <span className={priceOf(i) === cheapest ? "compare__price compare__price--best" : "compare__price"}>
          ₪{fmt(priceOf(i))}
          {priceOf(i) === cheapest && items.length > 1 && <span className="compare__best">הכי זול</span>}
        </span>
      ),
    },
    { label: "מידות", render: (i) => (live[i.id]?.sizes ?? i.sizes)?.split(",").join(" · ") || "—" },
    { label: "צבע", render: (i) => live[i.id]?.color ?? "—" },
    {
      label: "מלאי",
      render: (i) => {
        const l = live[i.id];
        if (!l) return "—";
        if (l.delisted) return "לא בחנות";
        return l.inStock ? "במלאי" : "אזל";
      },
    },
  ];

  return (
    <div className="compare">
      <button className="compare__back" onClick={onBack}>
        → חזרה לרשימה
      </button>

      <div className="compare__scroll">
        <table className="compare__table">
          <thead>
            <tr>
              <th />
              {items.map((item) => (
                <th key={item.id}>
                  {item.imageUrl ? (
                    <img className="compare__image" src={item.imageUrl} alt="" loading="lazy" />
                  ) : (
                    <div className="compare__image compare__image--empty" />
                  )}
                  <div className="compare__title">{item.title}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                {items.map((item) => (
                  <td key={item.id}>{row.render(item)}</td>
                ))}
              </tr>
            ))}
            <tr>
              <th scope="row" />
              {items.map((item) => (
                <td key={item.id}>
                  {/* One link per column, never a combined "buy these" --
                      each is a separate shop with its own checkout. */}
                  <a
                    className="compare__link"
                    href={live[item.id]?.url ?? item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    לחנות ←
                  </a>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
