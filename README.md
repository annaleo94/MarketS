# MarketS

חיפוש מוצר אחד → רשימת כל החנויות שמוכרות אותו, ממוינת מהזול ליקר.

MarketS הוא מנוע השוואת מחירים: מחפשים מוצר, והמערכת שואלת כל חנות
מחוברת "האם יש לך את זה, ובכמה?", ומחזירה תוצאה אחת ממוינת לפי מחיר.

## איך זה עובד

```
frontend (React)  →  backend (Express API)  →  Store adapters (מקבילית)
                              │                      │
                              │              ┌───────┴────────┐
                              │           חנויות הדגמה     חנויות אמיתיות
                              │           (נתונים מדומים)   (web scraping)
                              ▼
                      SQLite (מטמון תוצאות חיפוש, TTL)
```

- **Frontend**: React + Vite + TypeScript, ממשק בעברית מימין-לשמאל.
- **Backend**: Express + TypeScript. `GET /api/search?q=...` מריץ בקשה
  מקבילית לכל חנות פעילה, לוקח מכל חנות את התוצאה הכי רלוונטית לשאילתה,
  וממיין הכל לפי מחיר.
- **מסד נתונים**: Prisma + SQLite (קובץ מקומי, אפס הגדרה). תוצאות חיפוש
  נשמרות במטמון ל-`SEARCH_CACHE_TTL_MINUTES` דקות כדי לא להציף חנויות
  אמיתיות בבקשות על כל הקלדה.
- **חנויות**: כל חנות היא "אדפטר" שמיישם ממשק אחד —
  `search(query) => { title, price, url, ... }[]` (`backend/src/scrapers/types.ts`).
  איך הנתונים מגיעים (מדומה / scraping / API) לא משנה לשאר המערכת.

## הרצה מקומית

```bash
npm install                      # מתקין את שני הצדדים (workspaces)
cp backend/.env.example backend/.env
npm run db:push                  # יוצר את מסד ה-SQLite המקומי

npm run dev:backend              # http://localhost:4000
npm run dev:frontend             # http://localhost:5173 (עם פרוקסי ל-API)
```

פותחים `http://localhost:5173`, מחפשים משהו כמו "iphone 15" או
"מכונת כביסה" — המערכת עובדת מיד, כי כברירת מחדל היא משתמשת בשלוש
**חנויות הדגמה** עם קטלוג מוצרים מדומה (`backend/src/scrapers/adapters/mock-catalog.ts`)
ותמחור שונה בכל חנות, כדי שתהיה השוואת מחירים אמיתית לראות.

## חיבור חנויות אמיתיות (web scraping)

זה כבוי כברירת מחדל (`ENABLE_LIVE_SCRAPERS=false`). יש שני מנועי scraping
גנריים מוכנים:

1. **`generic-jsonld.adapter.ts`** — קורא נתוני `schema.org Product`
   מובנים (`<script type="application/ld+json">`) שהרבה חנויות מטמיעות
   ממילא ל-SEO. לא צריך selectors בכלל, ועמיד יותר בפני שינויי עיצוב.
2. **`generic-css.adapter.ts`** — fallback מבוסס CSS selectors לחנויות
   בלי JSON-LD.

**חשוב**: בזמן הפיתוח ניסיתי לאמת selectors מול כמה אתרי קמעונאות
ישראליים אמיתיים (KSP, Ivory, Bug) דרך גישה מתוכנתת, וזה נחסם
(403 / הגנת בוטים) או לא נתן מבנה HTML מהימן לאימות. במקום לשלוח קוד עם
selectors מנוחשים שכנראה לא יעבדו, `backend/src/scrapers/adapters/live/sites.ts`
מגיע ריק, עם תבנית להעתקה, וההוראות המדויקות איך לחבר חנות אמיתית
(בדיקת robots.txt/תנאי שימוש, מציאת ה-search URL, אימות selectors מול
הדפדפן בפועל) נמצאות ב־`backend/src/scrapers/adapters/live/README.md`.
זה תשתית עבודה אמיתית — רק שחיבור חנות ספציפית דורש אימות ידני מול
האתר החי, ולא ניתן לעשות זאת באופן אמין בלי גישה לדפדפן אמיתי מול כל
אתר ואתר.

לאתרים שמרנדרים תוצאות בצד לקוח (JS) יידרש אדפטר מבוסס Playwright
(מותקן כבר כתלות) במקום fetch רגיל — מוסבר גם הוא ב-README הנ"ל.

## מגבלת "אותו מוצר"

MarketS לא עושה זיהוי-ישות (entity resolution) מלא בין חנויות — במקום זה,
מכל חנות נלקחת התוצאה שהכי מתאימה לשאילתת החיפוש (ניקוד רלוונטיות לפי
חפיפת מילים, `backend/src/scrapers/normalize.ts`). זה עובד טוב לשאילתות
ספציפיות ("iPhone 15 128GB") אבל לא מבטיח זיהוי אותו SKU בדיוק בין
חנויות עם ניסוח שונה. שיפור עתידי טבעי: התאמה לפי ברקוד/מק"ט (EAN/GTIN)
כשהוא זמין בנתוני ה-JSON-LD.

## מבנה הפרויקט

```
backend/
  prisma/schema.prisma          # Store / SearchCache / Listing
  src/
    scrapers/
      types.ts                  # StoreAdapter interface
      normalize.ts               # normalization + relevance scoring
      adapters/
        mock-catalog.ts          # קטלוג הדגמה משותף
        mock-store.factory.ts    # בונה חנות-הדגמה עם תמחור דטרמיניסטי
        mock-stores.ts           # 3 חנויות הדגמה פעילות
        live/
          generic-jsonld.adapter.ts
          generic-css.adapter.ts
          sites.ts                # חנויות אמיתיות מוגדרות כאן (ריק כברירת מחדל)
          README.md                # מדריך חיבור חנות אמיתית
      registry.ts                 # אילו אדפטרים פעילים
    services/search.service.ts    # scrape מקבילי + מטמון + מיון
    routes/                       # /api/search, /api/stores, /api/health
frontend/
  src/
    components/                   # SearchBar, ResultsList, StoreRow
    App.tsx
```

## מה לבדוק לפני production

- **חוקיות**: לכל חנות אמיתית שמתחברים אליה — לקרוא תנאי שימוש, לכבד
  `robots.txt` (יש בדיקה אוטומטית ב-`live/robots.ts`, אבל היא best-effort
  ולא תחליף לבדיקה אנושית), ולשקול API/פיד שותפים רשמי לפני scraping.
- **DB**: SQLite מתאים לפיתוח/דמו; לפריסה אמיתית מחליפים ל-Postgres
  (`prisma/schema.prisma`, שינוי `provider` + `DATABASE_URL`).
- **Rate limiting**: אין היום rate limiting על ה-API עצמו — כדאי להוסיף
  לפני חשיפה לאינטרנט הפתוח.
