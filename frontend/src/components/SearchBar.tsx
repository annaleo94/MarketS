import { FormEvent, useState } from "react";

interface Props {
  onSearch: (query: string) => void;
  loading: boolean;
}

export function SearchBar({ onSearch, loading }: Props) {
  const [value, setValue] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) onSearch(trimmed);
  }

  return (
    <form className="search-bar" onSubmit={handleSubmit}>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="מה תרצה/י לחפש? למשל: iPhone 15, מכונת כביסה, נעלי ספורט..."
        aria-label="חיפוש מוצר"
      />
      <button type="submit" disabled={loading || !value.trim()}>
        {loading ? "מחפש..." : "חיפוש"}
      </button>
    </form>
  );
}
