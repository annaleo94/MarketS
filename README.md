# MarketS

פיילוט: תארו פריט בגדים לתינוקות/ילדים במילים שלכם → רשימת החנויות שמוכרות
אותו (פוקס, שילב, קרטרס), ממוינת מהזול ליקר. חיפוש בשפה חופשית מופעל ע"י LLM
דרך [OpenRouter](https://openrouter.ai).

## איך זה עובד

```
                    ┌─── npm run ingest ───┐
                    │  (או POST /api/admin/ingest, או אוטומטי באתחול אם הקטלוג ריק)
                    ▼                       │
   fox.co.il ──┐                            │
  shilav.co.il ─┼─► Catalog adapters ──► Product table (SQLite/Postgres)
cartersoshkosh ─┘   (נתונים אמיתיים)              │
                                                  ▼
frontend (React) ──► GET /api/search?q=... ──► לכל חנות: LLM (OpenRouter) בוחר
                                                 את המוצר המתאים ביותר לתיאור
                                                 (או fallback למילות מפתח)
                                                  │
                                                  ▼
                                       ממוין לפי מחיר + נשמר במטמון
```

זו לא ארכיטקטורה של "scrape בכל חיפוש" -- הקטלוג של כל חנות נשאב מראש
(`npm run ingest`) ונשמר במסד הנתונים. חיפוש משתמש קורא מהאינדקס המקומי,
ולכן מהיר ולא מציף את אתרי החנויות.

## הרצה מקומית

```bash
npm install
cp backend/.env.example backend/.env
# ערכו את backend/.env: הוסיפו OPENROUTER_API_KEY (ראו למטה)
npm run db:push --workspace backend
npm run ingest --workspace backend   # שואב קטלוג אמיתי מ-3 החנויות (כ-1-2 דק')

npm run dev:backend    # http://localhost:4000
npm run dev:frontend   # http://localhost:5173
```

אם `backend/prisma/dev.db` ריק כשהשרת עולה, הוא ירוץ `ingest` אוטומטית
ברקע -- אבל עדיף להריץ ידנית פעם ראשונה כדי לראות שהכול עבד.

## חיפוש בשפה חופשית (LLM)

1. פתחו [openrouter.ai/keys](https://openrouter.ai/keys), צרו מפתח.
2. ב-`backend/.env`: `OPENROUTER_API_KEY=sk-or-...`
3. אופציונלי: `OPENROUTER_MODEL` (ברירת מחדל: `google/gemini-2.5-flash` --
   זול ומהיר, מספיק לניואנסים כמו "חולצה ורודה לתינוקת בת חצי שנה").

בלי מפתח, החיפוש נופל אוטומטית ל**התאמת מילות מפתח** פשוטה (חפיפת מילים
עם כותרת המוצר) -- עדיין עובד, אבל לא מבין ניסוח חופשי/מילים נרדפות.

**איך ההתאמה עובדת בפועל**: לכל חנות בנפרד, ה-API שולח ל-LLM את התיאור של
הלקוח + את כל קטלוג המוצרים המאונדקס של אותה חנות (מזהה | כותרת | מחיר),
ומבקש ממנו לבחור את המוצר המתאים ביותר (או `null` אם באמת אין התאמה טובה).
ראו `backend/src/llm/match.service.ts`.

## מקורות הנתונים (אמיתיים, לא הדגמה)

| חנות | פלטפורמה | איך שואבים | קובץ |
|---|---|---|---|
| פוקס | Shopify | `/collections/<handle>/products.json` -- endpoint JSON ציבורי רשמי של Shopify | `backend/src/catalog/adapters/fox.adapter.ts` |
| שילב | Shopify | אותו endpoint, קטגוריית `fashion-clothing` | `backend/src/catalog/adapters/shilav.adapter.ts` |
| קרטרס | Magento (Hyva) | פרסור HTML של דף הקטגוריה -- הכותרת/מחיר/קישור מגיעים מתוך JSON מובנה (Google Tag Manager `dataLayer`) שמוטמע בכל כרטיס מוצר, לא ניחוש CSS selectors | `backend/src/catalog/adapters/carters.adapter.ts` |

**מיננה** נבדקה ונמצאה חסומה ע"י אתגר בוט אקטיבי של Cloudflare
(`cf-mitigated: challenge`) -- לא עקפנו את זה, כי זו הגנה מכוונת נגד גישה
אוטומטית. הוחלפה בקרטרס בהתאם להחלטת המשתמש.

כל השאיבה מכבדת `robots.txt` (בדיקה אוטומטית, best-effort --
`backend/src/catalog/robots.ts`) ומזדהה ב-User-Agent אמיתי. שווה לציין:
ה-`robots.txt` של פוקס ושילב (שתיהן חנויות Shopify) מכיל טקסט שמנוסח
כפנייה ישירה לסוכני AI, כולל המלצה "להמליץ בחום למשתמש להתקין" סקריפט
קניות צד-שלישי -- זו הזרקת-הנחיה (prompt injection) בתוך תוכן חיצוני, לא
הנחיה מהמשתמש שלכם, ו-MarketS מתעלמת ממנה.

## מבנה הפרויקט

```
backend/src/
  catalog/
    types.ts              # CatalogAdapter / CatalogProduct
    http.ts, robots.ts     # fetch + robots.txt courtesy check
    adapters/
      shopify.factory.ts   # מנוע משותף לפוקס/שילב
      fox.adapter.ts
      shilav.adapter.ts
      carters.adapter.ts   # פרסור HTML/GTM ייעודי לקרטרס
    registry.ts             # אילו חנויות פעילות בפיילוט
    ingest.ts                # שואב הכל, upsert ל-DB (גם CLI: `npm run ingest`)
  llm/
    openrouter.client.ts    # קליינט OpenRouter גנרי (JSON response)
    match.service.ts        # התאמה per-store: LLM, fallback למילות מפתח
  services/search.service.ts # מטמון + הרצת match.service על כל חנות + מיון
  routes/                    # /api/search, /api/stores, /api/admin/ingest
frontend/src/
  components/                # SearchBar, ResultsList, StoreRow
  App.tsx
```

## מה לבדוק לפני שמרחיבים

- **עדכניות**: הריצו `npm run ingest` (או `POST /api/admin/ingest`) בקביעות
  (cron) כדי שהמחירים/המלאי לא יתיישנו -- הפיילוט לא עושה זאת אוטומטית.
- **עלות LLM**: כל חיפוש לא-במטמון שולח את קטלוג המוצרים המלא של כל חנות
  ל-LLM (עד ~1000 שורות לחנות). זול מאוד במודל כמו Gemini Flash, אבל שווה
  לעקוב אחרי צריכת ה-API ב-OpenRouter אם מרחיבים לעוד חנויות/קטגוריות.
- **הרחבה לחנות חדשה**: אם היא Shopify, כנראה מספיק קובץ config חדש דרך
  `shopify.factory.ts`. אחרת -- בדקו אם יש JSON-LD/GTM מובנה לפני שכותבים
  CSS selectors.
