import { useState } from "react";
import { SearchBar } from "./components/SearchBar";
import { Results } from "./components/Results";
import { searchProducts, SearchResponse, AppliedFilter } from "./api";

export default function App() {
  const [data, setData] = useState<SearchResponse | null>(null);
  const [query, setQuery] = useState("");
  const [dropped, setDropped] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(q: string, drop: string[]) {
    setLoading(true);
    setError(null);
    try {
      setData(await searchProducts(q, drop));
    } catch (err) {
      setError(err instanceof Error ? err.message : "משהו השתבש");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(q: string) {
    setQuery(q);
    setDropped([]);
    run(q, []);
  }

  function handleDropFilter(kind: AppliedFilter["kind"]) {
    const next = [...dropped, kind];
    setDropped(next);
    run(query, next);
  }

  return (
    <div className="page">
      <header className="header">
        <h1>MarketS</h1>
        <p className="tagline">פיילוט: בגדי תינוקות וילדים — פוקס, שילב, קרטרס וקסטרו קידס</p>
        <p className="subtagline">
          תארו את הפריט במילים שלכם — "בגד ים מידה שנתיים", "חולצה לבנה לחג לבנות מידה 2"
        </p>
      </header>

      <SearchBar onSearch={handleSearch} loading={loading} />

      <main>
        {error && <div className="error-state">שגיאה: {error}</div>}
        {!error && loading && <div className="loading-state">מחפש בכל החנויות...</div>}
        {!error && !loading && data && <Results data={data} onDropFilter={handleDropFilter} />}
        {!error && !loading && !data && (
          <div className="intro">
            <p>תארו למעלה את הפריט שאתם מחפשים כדי להתחיל.</p>
          </div>
        )}
      </main>

      <footer className="footer">
        <p>
          כל הנתונים אמיתיים ונטענים ישירות מאתרי החנויות. קטגוריה, מידה ומגדר הם סינון קשיח — פריט
          שלא עומד בהם לא יוצג כלל.
        </p>
      </footer>
    </div>
  );
}
