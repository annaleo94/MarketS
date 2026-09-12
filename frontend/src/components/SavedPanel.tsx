import { useEffect } from "react";
import { useSaved, savedStatuses, fmt, itemCount, SavedItem, LiveProduct } from "../saved";

const currencySymbol: Record<string, string> = { ILS: "₪", USD: "$", EUR: "€" };

interface Props {
  open: boolean;
  onClose: () => void;
}

// The saved list, grouped by store -- because the one action this panel
// leads to is "go and buy it", and that happens on each store's own site.
// A shopper with four saved items from two stores has two trips to make,
// not four, and grouping is what makes that visible (and what makes a
// per-store subtotal mean something: it's what that trip would cost).
export function SavedPanel({ open, onClose }: Props) {
  const { items, live, remove, clear, refresh, refreshedAt } = useSaved();

  // Re-check prices every time it's opened. Someone who saved a coat last
  // week is opening this panel precisely to find out what happened to it.
  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const groups = groupByStore(items);

  return (
    <>
      <div className="saved-backdrop" onClick={onClose} />
      <aside className="saved-panel" role="dialog" aria-label="הפריטים ששמרתי" aria-modal="true">
        <header className="saved-panel__head">
          <div>
            <h2>הסל שלי</h2>
            <p className="saved-panel__sub">
              {items.length === 0
                ? "פריטים ששמרתם יופיעו כאן"
                : `${itemCount(items.length)} ששמרתם${groups.length > 1 ? ` מ-${groups.length} חנויות` : ""}`}
            </p>
          </div>
          <button className="saved-panel__close" onClick={onClose} aria-label="סגירה">
            ✕
          </button>
        </header>

        {items.length === 0 ? (
          <div className="saved-empty">
            <div className="saved-empty__icon" aria-hidden="true">
              ♡
            </div>
            <p className="saved-empty__title">עדיין לא שמרתם כלום</p>
            <p>
              לחצו על ה-♡ שליד כל פריט בתוצאות כדי לשמור אותו כאן — נשווה בשבילכם מחירים בין החנויות
              ונסמן לכם כשמחיר יורד או כשפריט חוזר למלאי.
            </p>
          </div>
        ) : (
          <>
            <div className="saved-panel__body">
              {groups.map((group) => {
                const subtotal = group.items.reduce((sum, i) => sum + (live[i.id]?.price ?? i.price), 0);
                return (
                  <section key={group.storeKey} className="saved-store">
                    <h3 className="saved-store__head">
                      {group.storeName}
                      <span className="saved-store__total">
                        {itemCount(group.items.length)} · ₪{fmt(Math.round(subtotal * 100) / 100)}
                      </span>
                    </h3>
                    <ul className="saved-store__items">
                      {group.items.map((item) => (
                        <SavedRow key={item.id} item={item} current={live[item.id]} onRemove={() => remove(item.id)} />
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>

            <footer className="saved-panel__foot">
              <p className="saved-panel__note">
                כאן רק שומרים ומשווים — הקנייה עצמה מתבצעת באתר של החנות.
                {refreshedAt && <> המחירים נבדקו מחדש {refreshedAt.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}.</>}
              </p>
              <button className="saved-panel__clear" onClick={clear}>
                ניקוי הסל
              </button>
            </footer>
          </>
        )}
      </aside>
    </>
  );
}

function SavedRow({
  item,
  current,
  onRemove,
}: {
  item: SavedItem;
  current: LiveProduct | undefined;
  onRemove: () => void;
}) {
  const symbol = currencySymbol[item.currency] ?? item.currency;
  const price = current?.price ?? item.price;
  const statuses = savedStatuses(item, current);
  const dropped = current !== undefined && current.price < item.price - 0.005;

  return (
    <li className={`saved-row${current?.delisted ? " saved-row--gone" : ""}`}>
      {item.imageUrl ? (
        <img className="saved-row__image" src={item.imageUrl} alt="" loading="lazy" />
      ) : (
        <div className="saved-row__image saved-row__image--empty" />
      )}

      <div className="saved-row__body">
        <div className="saved-row__title">{item.title}</div>
        {item.sizes && <div className="saved-row__meta">{item.sizes.split(",").join(" · ")}</div>}
        {statuses.length > 0 && (
          <div className="saved-row__statuses">
            {statuses.map((s) => (
              <span key={s.label} className={`saved-tag saved-tag--${s.tone}`}>
                {s.label}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="saved-row__side">
        <button className="saved-row__remove" onClick={onRemove} aria-label={`הסרת ${item.title} מהסל`}>
          ✕
        </button>
        <div className={`saved-row__price${dropped ? " saved-row__price--dropped" : ""}`}>
          {symbol}
          {fmt(price)}
          {/* The old price is worth keeping on screen next to the new one --
              "ירד ל-₪40" means nothing without the number it fell from. */}
          {dropped && <span className="saved-row__was">₪{fmt(item.price)}</span>}
        </div>
        <a className="saved-row__link" href={current?.url ?? item.url} target="_blank" rel="noopener noreferrer">
          לחנות ←
        </a>
      </div>
    </li>
  );
}

function groupByStore(items: SavedItem[]): { storeKey: string; storeName: string; items: SavedItem[] }[] {
  const groups = new Map<string, { storeKey: string; storeName: string; items: SavedItem[] }>();
  for (const item of items) {
    const group = groups.get(item.storeKey) ?? { storeKey: item.storeKey, storeName: item.storeName, items: [] };
    group.items.push(item);
    groups.set(item.storeKey, group);
  }
  return [...groups.values()];
}
