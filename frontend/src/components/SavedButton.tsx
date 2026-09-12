import { useEffect, useRef, useState } from "react";
import { itemCount, useSaved } from "../saved";

// Pinned to the top corner rather than sitting in the hero: the moment a
// shopper wants it is right after saving something halfway down a long
// list of results, and a button that has scrolled away by then isn't
// there when it's needed.
export function SavedButton({ onOpen }: { onOpen: () => void }) {
  const { items } = useSaved();
  const [bumped, setBumped] = useState(false);
  const previous = useRef(items.length);

  // A short pulse when the count goes up, so a click on a ♡ far down the
  // page visibly lands somewhere instead of seeming to do nothing.
  useEffect(() => {
    const grew = items.length > previous.current;
    previous.current = items.length;
    if (!grew) return;

    setBumped(true);
    const timer = setTimeout(() => setBumped(false), 400);
    return () => clearTimeout(timer);
  }, [items.length]);

  return (
    <button
      className={`saved-button${bumped ? " saved-button--bumped" : ""}`}
      onClick={onOpen}
      aria-label={items.length > 0 ? `השמורים שלי, ${itemCount(items.length)}` : "השמורים שלי, ריק"}
    >
      <span className="saved-button__icon" aria-hidden="true">
        ♡
      </span>
      <span className="saved-button__label">השמורים שלי</span>
      {items.length > 0 && <span className="saved-button__count">{items.length}</span>}
    </button>
  );
}
