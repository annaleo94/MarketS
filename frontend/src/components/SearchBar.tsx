import { FormEvent, useRef, useState } from "react";

interface Props {
  onSearch: (query: string) => void;
  loading: boolean;
}

export function SearchBar({ onSearch, loading }: Props) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) onSearch(trimmed);
  }

  function handleClear() {
    setValue("");
    inputRef.current?.focus();
  }

  return (
    <form className="search-bar" onSubmit={handleSubmit}>
      <div className="search-bar__field">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={'מה תרצה/י לחפש? למשל: "מכנסי ג\'ינס בנות מידה 4"'}
          aria-label="חיפוש מוצר"
        />
        {value && (
          <button type="button" className="search-bar__clear" onClick={handleClear} aria-label="נקה חיפוש">
            ✕
          </button>
        )}
      </div>
      <button type="submit" className="search-bar__submit" disabled={loading || !value.trim()}>
        {loading ? "מחפש..." : "חיפוש"}
      </button>
    </form>
  );
}
