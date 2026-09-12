import { useEffect, useState } from "react";
import {
  useSaved,
  primaryStatus,
  secondaryStatuses,
  fmt,
  itemCount,
  DEFAULT_LIST,
  SavedItem,
  LiveProduct,
} from "../saved";
import { CompareView } from "./CompareView";
import { StoreBadge } from "./StoreBadge";

const currencySymbol: Record<string, string> = { ILS: "₪", USD: "$", EUR: "€" };

// Comparing more than this stops being readable on a phone, which is
// where most of this gets used.
const MAX_COMPARE = 4;

interface Props {
  open: boolean;
  onClose: () => void;
}

// The saved list. Everything here is built around watching rather than
// buying: no total, no quantities, and no single "checkout" -- items come
// from different shops and each one is bought on its own site, so the
// only outgoing action is a per-item link.
//
// Items are still grouped by store, because that's the order the errands
// happen in, but the group heading carries a count and nothing that looks
// like a bill.
export function SavedPanel({ open, onClose }: Props) {
  const { items, live, lists, remove, clear, moveToList, createList, refresh, refreshedAt } = useSaved();
  const [activeList, setActiveList] = useState(DEFAULT_LIST);
  const [newListFor, setNewListFor] = useState<string | null>(null); // item id, or "" for a bare new list
  const [selected, setSelected] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);

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

  // A list that just lost its last item shouldn't leave the panel staring
  // at a tab that no longer exists.
  useEffect(() => {
    if (!lists.includes(activeList)) setActiveList(DEFAULT_LIST);
  }, [lists, activeList]);

  if (!open) return null;

  const inList = items.filter((i) => i.listName === activeList);
  const groups = groupByStore(inList);
  const selectedItems = inList.filter((i) => selected.includes(i.id));

  const toggleSelected = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= MAX_COMPARE ? prev : [...prev, id]
    );

  return (
    <>
      <div className="saved-backdrop" onClick={onClose} />
      <aside
        className={`saved-panel${comparing ? " saved-panel--wide" : ""}`}
        role="dialog"
        aria-label="השמורים שלי"
        aria-modal="true"
      >
        <header className="saved-panel__head">
          <div>
            <h2>השמורים שלי</h2>
            <p className="saved-panel__sub">
              {items.length === 0 ? "פריטים ששמרתם למעקב יופיעו כאן" : `${itemCount(items.length)} במעקב`}
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
              לחצו על ה-♡ שליד כל פריט בתוצאות כדי לעקוב אחריו — נסמן לכם כאן כשהמחיר יורד, כשמתחיל מבצע,
              כשפריט אוזל וכשהוא חוזר למלאי.
            </p>
          </div>
        ) : comparing ? (
          <CompareView items={selectedItems} live={live} onBack={() => setComparing(false)} />
        ) : (
          <>
            {/* Named lists ("לחג", "לדנה"...) -- tabs rather than separate
                screens, since it's the same data seen through a filter. */}
            <div className="saved-tabs">
              {lists.map((name) => (
                <button
                  key={name}
                  className={`saved-tab${name === activeList ? " saved-tab--active" : ""}`}
                  onClick={() => {
                    setActiveList(name);
                    setSelected([]);
                  }}
                >
                  {name}
                  <span className="saved-tab__count">{items.filter((i) => i.listName === name).length}</span>
                </button>
              ))}
              <button className="saved-tab saved-tab--new" onClick={() => setNewListFor("")}>
                + רשימה חדשה
              </button>
            </div>

            {newListFor === "" && (
              <NewListForm
                onCancel={() => setNewListFor(null)}
                onCreate={(name) => {
                  createList(name);
                  setActiveList(name);
                  setNewListFor(null);
                }}
              />
            )}

            <div className="saved-panel__body">
              {inList.length === 0 ? (
                <p className="saved-list-empty">
                  הרשימה "{activeList}" ריקה עדיין. אפשר להעביר לכאן פריט מרשימה אחרת, או לשמור פריט חדש
                  מהתוצאות.
                </p>
              ) : (
                groups.map((group) => {
                  // Prefer the live catalogue's own record of the store
                  // (fresher, and carries the logo/English name) -- the
                  // Hebrew name each item stored at save-time is only the
                  // fallback for while that hasn't loaded yet or is
                  // unreachable.
                  const liveStore = live[group.items[0]?.id]?.store;
                  return (
                    <section key={group.storeKey} className="saved-store">
                      <h3 className="saved-store__head">
                        <StoreBadge store={liveStore ?? { name: group.storeName }} size="sm" />
                        <span className="saved-store__count">{itemCount(group.items.length)}</span>
                      </h3>
                      <ul className="saved-store__items">
                        {group.items.map((item) => (
                          <SavedRow
                            key={item.id}
                            item={item}
                            current={live[item.id]}
                            lists={lists}
                            selected={selected.includes(item.id)}
                            selectable={selected.includes(item.id) || selected.length < MAX_COMPARE}
                            onSelect={() => toggleSelected(item.id)}
                            onRemove={() => remove(item.id)}
                            onMove={(name) => moveToList(item.id, name)}
                            onNewList={() => setNewListFor(item.id)}
                          />
                        ))}
                      </ul>
                    </section>
                  );
                })
              )}

              {newListFor && newListFor !== "" && (
                <NewListForm
                  onCancel={() => setNewListFor(null)}
                  onCreate={(name) => {
                    createList(name);
                    moveToList(newListFor, name);
                    setActiveList(name);
                    setNewListFor(null);
                  }}
                />
              )}
            </div>

            <footer className="saved-panel__foot">
              {selected.length >= 2 ? (
                <button className="saved-panel__compare" onClick={() => setComparing(true)}>
                  השוואה בין {selected.length} פריטים
                </button>
              ) : (
                <p className="saved-panel__note">
                  {selected.length === 1
                    ? "סמנו עוד פריט אחד לפחות כדי להשוות ביניהם"
                    : "כאן רק עוקבים ומשווים — הקנייה עצמה מתבצעת באתר של החנות."}
                  {selected.length === 0 && refreshedAt && (
                    <>
                      {" "}
                      נבדק לאחרונה {refreshedAt.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}.
                    </>
                  )}
                </p>
              )}
              <button className="saved-panel__clear" onClick={() => clear(activeList)} disabled={inList.length === 0}>
                ריקון "{activeList}"
              </button>
            </footer>
          </>
        )}
      </aside>
    </>
  );
}

function NewListForm({ onCreate, onCancel }: { onCreate: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  return (
    <form
      className="saved-newlist"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (trimmed) onCreate(trimmed);
      }}
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder='שם הרשימה, למשל "לחג"'
        aria-label="שם הרשימה החדשה"
        maxLength={30}
      />
      <button type="submit" disabled={!name.trim()}>
        יצירה
      </button>
      <button type="button" onClick={onCancel}>
        ביטול
      </button>
    </form>
  );
}

function SavedRow({
  item,
  current,
  lists,
  selected,
  selectable,
  onSelect,
  onRemove,
  onMove,
  onNewList,
}: {
  item: SavedItem;
  current: LiveProduct | undefined;
  lists: string[];
  selected: boolean;
  selectable: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onMove: (listName: string) => void;
  onNewList: () => void;
}) {
  const symbol = currencySymbol[item.currency] ?? item.currency;
  const price = current?.price ?? item.price;
  const status = primaryStatus(item, current);
  const extras = secondaryStatuses(item, current);
  const dropped = status?.tone === "good" && status.label.startsWith("ירד");

  return (
    <li className={`saved-row${current?.delisted ? " saved-row--gone" : ""}${selected ? " saved-row--selected" : ""}`}>
      <input
        type="checkbox"
        className="saved-row__check"
        checked={selected}
        disabled={!selectable}
        onChange={onSelect}
        aria-label={`בחירת ${item.title} להשוואה`}
        title={selectable ? "סימון להשוואה" : `אפשר להשוות עד ${MAX_COMPARE} פריטים`}
      />

      {item.imageUrl ? (
        <img className="saved-row__image" src={item.imageUrl} alt="" loading="lazy" />
      ) : (
        <div className="saved-row__image saved-row__image--empty" />
      )}

      <div className="saved-row__body">
        <div className="saved-row__title">{item.title}</div>
        {item.sizes && <div className="saved-row__meta">{item.sizes.split(",").join(" · ")}</div>}
        {(status || extras.length > 0) && (
          <div className="saved-row__statuses">
            {status && <span className={`saved-tag saved-tag--${status.tone}`}>{status.label}</span>}
            {extras.map((s) => (
              <span key={s.label} className={`saved-tag saved-tag--${s.tone}`}>
                {s.label}
              </span>
            ))}
          </div>
        )}

        {/* Moving between the shopper's own lists. A select rather than a
            menu: it's one choice out of a short list, and it stays usable
            with a keyboard and on a phone. */}
        <select
          className="saved-row__move"
          value={item.listName}
          aria-label={`הרשימה של ${item.title}`}
          onChange={(e) => (e.target.value === "__new__" ? onNewList() : onMove(e.target.value))}
        >
          {lists.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
          <option value="__new__">רשימה חדשה…</option>
        </select>
      </div>

      <div className="saved-row__side">
        <button className="saved-row__remove" onClick={onRemove} aria-label={`הסרת ${item.title} מהשמורים`}>
          ✕
        </button>
        <div className={`saved-row__price${dropped ? " saved-row__price--dropped" : ""}`}>
          {symbol}
          {fmt(price)}
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
