import { useState } from "react";
import { SearchBar } from "./components/SearchBar";
import { ResultsList } from "./components/ResultsList";
import { searchProducts, SearchResultItem } from "./api";

export default function App() {
  const [results, setResults] = useState<SearchResultItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [llmEnabled, setLlmEnabled] = useState<boolean | null>(null);

  async function handleSearch(q: string) {
    setLoading(true);
    setError(null);
    setQuery(q);
    try {
      const res = await searchProducts(q);
      setResults(res.results);
      setLlmEnabled(res.llmEnabled);
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
        <p className="tagline">פיילוט: בגדי תינוקות וילדים — פוקס, שילב וקרטרס, מהזול ליקר</p>
        <p className="subtagline">תארו את הפריט במילים שלכם — "חולצה ורודה לבת בת שנה", "אוברול חורפי לבן" וכו'</p>
      </header>

      <SearchBar onSearch={handleSearch} loading={loading} />

      <main>
        {error && <div className="error-state">שגיאה: {error}</div>}
        {!error && loading && <div className="loading-state">מחפש התאמות...</div>}
        {!error && !loading && results && <ResultsList results={results} query={query} />}
        {!error && !loading && !results && (
          <div className="intro">
            <p>תארו למעלה את הפריט שאתם מחפשים כדי להתחיל.</p>
          </div>
        )}
      </main>

      <footer className="footer">
        <p>
          כל הנתונים אמיתיים ונטענים ישירות מאתרי החנויות (ראו <code>backend/src/catalog/adapters</code>).
          {llmEnabled !== null && (
            <> ההתאמה בוצעה {llmEnabled ? "באמצעות LLM (OpenRouter)" : "באמצעות התאמת מילות מפתח — הגדירו OPENROUTER_API_KEY להפעלת חיפוש בשפה חופשית"}.</>
          )}
        </p>
      </footer>
    </div>
  );
}
