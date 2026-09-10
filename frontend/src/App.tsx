import { useState } from "react";
import { SearchBar } from "./components/SearchBar";
import { ResultsList } from "./components/ResultsList";
import { searchProducts, SearchResultItem } from "./api";

export default function App() {
  const [results, setResults] = useState<SearchResultItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch(q: string) {
    setLoading(true);
    setError(null);
    setQuery(q);
    try {
      const res = await searchProducts(q);
      setResults(res.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "משהו השתבש");
      setResults(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <header className="header">
        <h1>MarketS</h1>
        <p className="tagline">חפש/י מוצר, קבל/י את כל החנויות שמוכרות אותו — מהזול ליקר</p>
      </header>

      <SearchBar onSearch={handleSearch} loading={loading} />

      <main>
        {error && <div className="error-state">שגיאה: {error}</div>}
        {!error && loading && <div className="loading-state">סורק חנויות...</div>}
        {!error && !loading && results && <ResultsList results={results} query={query} />}
        {!error && !loading && !results && (
          <div className="intro">
            <p>הקלד/י שם מוצר למעלה כדי להתחיל.</p>
          </div>
        )}
      </main>

      <footer className="footer">
        <p>
          MarketS משתמשת כברירת מחדל בחנויות הדגמה כדי שהמערכת תעבוד מיד ללא הגדרה. חיבור חנויות אמיתיות
          מתועד ב-<code>backend/src/scrapers/adapters/live/README.md</code>.
        </p>
      </footer>
    </div>
  );
}
