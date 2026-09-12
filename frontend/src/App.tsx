import { useState } from "react";
import { SearchBar } from "./components/SearchBar";
import { Results } from "./components/Results";
import { SavedButton } from "./components/SavedButton";
import { SavedPanel } from "./components/SavedPanel";
import { SavedProvider } from "./saved";
import { searchProducts, SearchResponse } from "./api";

export default function App() {
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedOpen, setSavedOpen] = useState(false);

  async function run(q: string) {
    setLoading(true);
    setError(null);
    try {
      setData(await searchProducts(q));
    } catch (err) {
      setError(err instanceof Error ? err.message : "משהו השתבש");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SavedProvider>
      <SavedButton onOpen={() => setSavedOpen(true)} />
      <SavedPanel open={savedOpen} onClose={() => setSavedOpen(false)} />

      <header className="hero">
        <div className="hero__blob hero__blob--1" />
        <div className="hero__blob hero__blob--2" />
        <div className="hero__blob hero__blob--3" />
        <div className="hero__inner">
          <h1>MarketS</h1>
          <p className="tagline">גדלים מהר, קונים חכם</p>
          <p className="subtagline">משווים מחירים בפוקס, שילב, קרטרס וקסטרו קידס — במקום אחד</p>
        </div>
      </header>

      <div className="page">
        <SearchBar onSearch={run} loading={loading} />

        <main>
          {error && <div className="error-state">שגיאה: {error}</div>}
          {!error && loading && <div className="loading-state">מחפש בכל החנויות...</div>}
          {!error && !loading && data && <Results data={data} />}
          {!error && !loading && !data && (
            <div className="intro">
              <p>תארו למעלה את הפריט שאתם מחפשים כדי להתחיל — למשל "בגד ים מידה שנתיים".</p>
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
    </SavedProvider>
  );
}
