import { SearchResultItem } from "../api";
import { useSaved } from "../saved";

// The one control that puts a product in the saved list. It's a toggle
// rather than an "add" so a second click undoes a mistake in place --
// there's no undo bar, and making someone open the panel to remove
// something they just added by accident would be worse.
export function SaveToggle({
  item,
  store,
}: {
  item: SearchResultItem;
  store: { key: string; name: string };
}) {
  const { isSaved, toggle } = useSaved();
  const saved = isSaved(item.id);

  return (
    <button
      type="button"
      className={`save-toggle${saved ? " save-toggle--on" : ""}`}
      aria-pressed={saved}
      aria-label={saved ? `הסרת ${item.title} מהסל` : `שמירת ${item.title} בסל`}
      title={saved ? "שמור בסל — לחצו להסרה" : "שמירה בסל ומעקב אחרי המחיר"}
      onClick={() =>
        toggle({
          id: item.id,
          title: item.title,
          price: item.price,
          currency: item.currency,
          url: item.url,
          imageUrl: item.imageUrl,
          sizes: item.sizes,
          storeKey: store.key,
          storeName: store.name,
          savedAt: new Date().toISOString(),
        })
      }
    >
      {saved ? "♥" : "♡"}
    </button>
  );
}
