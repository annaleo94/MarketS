# MarketS

פיילוט: תארו פריט בגדים לתינוקות/ילדים במילים שלכם → רשימת החנויות שמוכרות
אותו (פוקס, שילב, קרטרס, קסטרו קידס), ממוינת מהזול ליקר. חיפוש בשפה חופשית מופעל ע"י LLM
דרך [OpenRouter](https://openrouter.ai).

**חי באוויר:** https://itl57pbfd8a9c.box.lathe.computer

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
| קסטרו קידס | Magento (ערכת נושא מותאמת) | פרסור HTML: JSON מובנה של כל מוצר -- שם/תמונה/קישור מתוך attribute של כפתור המועדפים, מחיר/מידות/מלאי מתוך config של הswatches, שניהם מקושרים לפי productId | `backend/src/catalog/adapters/castro.adapter.ts` |

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

## פריסה (Deployment)

האפליקציה רצה כ-container אחד שמגיש גם את ה-API וגם את ה-frontend הבנוי
(אותו origin, בלי CORS), על מכונת [Lathe](https://lathe.live) יחד עם
ה-Postgres שלה.

1. push לענף → GitHub Actions (`.github/workflows/docker-publish.yml`) בונה
   את `Dockerfile` ודוחף ל-`ghcr.io/annaleo94/markets:latest`.
2. `deploy_app` על ה-instance מושך את ה-image מחדש ומפעיל אותו.
3. ה-container מריץ `prisma db push` **ברקע** ומיד מפעיל את השרת -- ראו
   ההערה ב-`Dockerfile`: במכולה הזו Prisma לא מצליחה להרוג את תהליך-הבן
   שלה (`kill EACCES`), ולכן `prisma db push` **תקוע לנצח אחרי** שסיים
   את העבודה. אם מריצים אותו בטור לפני השרת -- השרת לעולם לא עולה.
4. אם הקטלוג ריק בעליית השרת, הוא מריץ ingest אוטומטית ברקע.

עדכון קטלוג/מחירים בפרודקשן:

```bash
curl -X POST https://<host>/api/admin/ingest -H "X-Admin-Token: <ADMIN_TOKEN>"
```

(זה גם מנקה את מטמון החיפושים, שמצביע על הקטלוג הישן.)

### הסל שלי (רשימת שמורים)

הכפתור בפינה השמאלית העליונה פותח את "הסל" -- רשימת פריטים שהלקוח שמר.
זה **לא** סל קניות: אין כאן רכישה, והיא מתבצעת באתר החנות. לכן הרשימה
בנויה סביב מעקב ולא סביב תשלום: כל פריט נשמר עם המחיר שהיה בזמן השמירה,
וכשפותחים את הסל הוא נבדק מחדש מול הקטלוג (`GET /api/products?ids=...`)
ומסומן -- ירד/עלה במחיר, במבצע, אזל מהמלאי, או כבר לא קיים בחנות.
הפריטים מקובצים לפי חנות, כי כל חנות היא "נסיעה" נפרדת לביצוע הקנייה.

הרשימה נשמרת ב-`localStorage` של הדפדפן (אין משתמשים/התחברות באתר).

### סנכרון אוטומטי והיסטוריית מוצר

הקטלוג מסתנכרן מעצמו כל `SYNC_INTERVAL_HOURS` שעות (ברירת מחדל 6; 0 מכבה).
המועד הבא נקבע מטבלת `SyncRun` ולא מטיימר בזיכרון -- deploy מפעיל את
ה-container מחדש, וטיימר בזיכרון היה מאפס את השעון בכל פעם.

למה 6 שעות: השוואה בין כל המחירים השמורים לבין סריקה חדשה של ארבע החנויות
בהפרש שלוש שעות מצאה **0 שינויי מחיר ו-0 שינויי מלאי** מתוך 3,529 מוצרים,
כך שסנכרון שעתי הוא בזבוז; ארבע ריצות ביום עדיין תופסות מבצע שהתחלף בלילה
באותו בוקר. (המדידה נעשתה בחלון ערב אחד, שהוא שקט מטבעו -- `SyncRun` שומרת
כמה שינויים כל ריצה באמת מצאה, כך שאפשר לגזור את המספר מהנתונים שלנו.)

כל ריצה מתעדת לכל מוצר מה השתנה (`ProductEvent`): `listed`, `price-drop`,
`price-rise`, `sale-start`, `sale-end`, `out-of-stock`, `back-in-stock`,
`delisted`, `relisted` -- וכן `lowestPrice`/`highestPrice`/`previousPrice`
על המוצר עצמו. מוצר שנעלם מהפיד **לא נמחק** אלא מסומן `delistedAt`, אחרת
ההיסטוריה שלו הייתה נמחקת איתו ולא היה אפשר לזהות שהוא חזר.

שלוש מתוך ארבע החנויות מפרסמות מחיר "לפני הנחה" (פוקס דרך
`compare_at_price` של Shopify, קסטרו וקרטרס דרך ה-price box של Magento);
שילב לא מפרסמת כלל, ולכן מבצעים שלה מזוהים רק כירידות מחיר שאנחנו רואים
בעצמנו לאורך זמן.

מה הסנכרון עושה בפועל:

```bash
curl https://<host>/api/admin/sync-status -H "X-Admin-Token: <ADMIN_TOKEN>"
```

מחזיר את הריצות האחרונות, סך האירועים לפי סוג, ואת שינויי המחיר/המלאי
האחרונים בקטלוג.

## מה לבדוק לפני שמרחיבים

- **עדכניות**: מטופל אוטומטית (ראו "סנכרון אוטומטי" למעלה). שווה להציץ
  ב-`/api/admin/sync-status` מדי פעם ולוודא שהריצות באמת קורות ומוצאות
  שינויים.
- **עלות LLM**: כל חיפוש לא-במטמון שולח את קטלוג המוצרים המלא של כל חנות
  ל-LLM (עד ~1000 שורות לחנות). זול מאוד במודל כמו Gemini Flash, אבל שווה
  לעקוב אחרי צריכת ה-API ב-OpenRouter אם מרחיבים לעוד חנויות/קטגוריות.
- **הרחבה לחנות חדשה**: אם היא Shopify, כנראה מספיק קובץ config חדש דרך
  `shopify.factory.ts`. אחרת -- בדקו אם יש JSON-LD/GTM מובנה לפני שכותבים
  CSS selectors.
