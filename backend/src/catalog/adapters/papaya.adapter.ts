import { createIdusAdapter } from "./idus.factory";

const BASE_URL = "https://www.papaya.co.il";

// פפאיה is Magento on the same "Idus" theme as Castro, so it shares
// idus.factory.ts wholesale -- same wishlist `product_data` blob, same
// swatch `jsonConfig` for prices/sizes/stock. (The store writes its own
// name "פפאיה", which is what's used here.)
//
// Like Nimrod, this is a footwear store, not a clothing one: its sizes are
// EU shoe sizes rather than ages -- see catalog/sizes.ts.
//
// Coverage is deliberately one page per category. papaya.co.il/robots.txt
// disallows `/*?` -- every URL with a query string -- and this theme pages
// with `?p=2`, so page 2 onwards is off-limits and the first 12 products
// of each category are all we're entitled to read. Its own sitemap.xml
// agrees on where the line is: 1,504 URLs, not one of them carrying a
// query string. The breadth below is the answer to that depth limit --
// every product-bearing leaf category the sitemap lists, so the slice we
// do take spans the whole catalogue rather than one corner of it.
//
// Two sitemap categories are deliberately left out rather than forgotten:
// /אביזרים/תיקי-גן (school bags) and /אביזרים/כדורים (balls) are neither
// clothing nor footwear, and this is a baby/kids apparel comparison.
export const papayaAdapter = createIdusAdapter({
  key: "papaya",
  name: "פפאיה",
  nameEn: "Papaya",
  baseUrl: BASE_URL,
  // The storefront header's own wordmark (a 215x44 PNG), not the 64x64
  // favicon -- both resolve, but the wordmark is the mark a shopper
  // actually recognises the chain by.
  logoUrl: `${BASE_URL}/pub/media/idus/default/papaya_logo_2_1.png`,
  paginated: false,
  categoryPaths: [
    { path: "בנות/סנדלים", category: "סנדלים", storeGender: "בנות" },
    { path: "בנות/סניקרס", category: "סניקרס", storeGender: "בנות" },
    { path: "בנות/ספורט", category: "נעלי ספורט", storeGender: "בנות" },
    { path: "בנות/נעלי-בית", category: "נעלי בית", storeGender: "בנות" },
    { path: "בנות/מגפיים-ומגפונים", category: "מגפיים", storeGender: "בנות" },
    { path: "בנות/מגפונים", category: "מגפונים", storeGender: "בנות" },
    { path: "בנות/מגפי-גשם", category: "מגפי גשם", storeGender: "בנות" },
    { path: "בנות/בריכה-וים", category: "נעליים", storeGender: "בנות" },
    { path: "בנות/כפכפי-פרווה", category: "כפכפים", storeGender: "בנות" },
    { path: "בנות/צעד-ראשון", category: "נעליים", storeGender: "בנות" },
    { path: "בנות/צעד-שני", category: "נעליים", storeGender: "בנות" },
    { path: "בנות/נעלי-בובה", category: "נעליים", storeGender: "בנות" },
    { path: "בנות/נערות-מידות-36-41", category: "נעליים", storeGender: "בנות" },
    { path: "בנות/חדש-בחנות", category: "נעליים", storeGender: "בנות" },
    { path: "בנות/דמויות", category: "נעליים", storeGender: "בנות" },

    { path: "בנים/סנדלים", category: "סנדלים", storeGender: "בנים" },
    { path: "בנים/סניקרס", category: "סניקרס", storeGender: "בנים" },
    { path: "בנים/ספורט-וקטרגל", category: "נעלי ספורט", storeGender: "בנים" },
    { path: "בנים/קטרגל", category: "נעלי ספורט", storeGender: "בנים" },
    { path: "בנים/נעלי-בית", category: "נעלי בית", storeGender: "בנים" },
    { path: "בנים/מגפיים-ומגפונים", category: "מגפיים", storeGender: "בנים" },
    { path: "בנים/מגפונים", category: "מגפונים", storeGender: "בנים" },
    { path: "בנים/מגפי-גשם", category: "מגפי גשם", storeGender: "בנים" },
    { path: "בנים/בריכה-וים", category: "נעליים", storeGender: "בנים" },
    { path: "בנים/צעד-ראשון", category: "נעליים", storeGender: "בנים" },
    { path: "בנים/צעד-שני", category: "נעליים", storeGender: "בנים" },
    { path: "בנים/מוקסין", category: "נעליים", storeGender: "בנים" },
    { path: "בנים/נערים-מידות-36-41", category: "נעליים", storeGender: "בנים" },
    { path: "בנים/חדש-בחנות", category: "נעליים", storeGender: "בנים" },
    { path: "בנים/דמויות", category: "נעליים", storeGender: "בנים" },

    { path: "אביזרים/אקססוריז", category: "אביזרים" },
    { path: "אביזרים/גרביים-וגרביונים", category: "גרביים" },
    { path: "אביזרים/הלבשה-תחתונה" },
    { path: "אביזרים/ביגוד-לתינוקות" },

    // The outlet tree is its own set of listings, not a re-cut of the
    // categories above -- verified: it surfaces products the main
    // categories no longer carry.
    { path: "outlet/בנות/סנדלים", category: "סנדלים", storeGender: "בנות" },
    { path: "outlet/בנות/סניקרס", category: "סניקרס", storeGender: "בנות" },
    { path: "outlet/בנות/נעלי-ספורט", category: "נעלי ספורט", storeGender: "בנות" },
    { path: "outlet/בנות/נעלי-בובה", category: "נעליים", storeGender: "בנות" },
    { path: "outlet/בנות/מגפיים-ומגפונים", category: "מגפיים", storeGender: "בנות" },
    { path: "outlet/בנות/צעד-ראשון", category: "נעליים", storeGender: "בנות" },
    { path: "outlet/בנות/צעד-שני", category: "נעליים", storeGender: "בנות" },
    { path: "outlet/בנות/דמויות", category: "נעליים", storeGender: "בנות" },
    { path: "outlet/בנים/סנדלים", category: "סנדלים", storeGender: "בנים" },
    { path: "outlet/בנים/סניקרס", category: "סניקרס", storeGender: "בנים" },
    { path: "outlet/בנים/נעלי-ספורט-וקט-רגל", category: "נעלי ספורט", storeGender: "בנים" },
    { path: "outlet/בנים/מגפיים-ומגפונים", category: "מגפיים", storeGender: "בנים" },
    { path: "outlet/בנים/צעד-ראשון", category: "נעליים", storeGender: "בנים" },
    { path: "outlet/בנים/צעד-שני", category: "נעליים", storeGender: "בנים" },
    { path: "outlet/בנים/דמויות", category: "נעליים", storeGender: "בנים" },
  ],
});
