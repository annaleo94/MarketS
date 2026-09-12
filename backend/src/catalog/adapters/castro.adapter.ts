import { createIdusAdapter } from "./idus.factory";

const BASE_URL = "https://www.castro.com";

// Castro is Magento (a custom "Idus" theme, not stock Luma) -- see
// idus.factory.ts for how its grids are parsed, which Papaya shares.
//
// Its top-level department pages (/ילדים, /ילדות, /תינוקות) are pure
// category-tree hubs with no products of their own -- verified 2026-09 by
// fetching them and finding zero price/jsonConfig blocks despite a 200 and
// a full page of HTML. The actual listings live one level down, so each
// entry here is a real, product-bearing "view all for this garment type"
// page, confirmed individually against the live site.
//
// `category` is a taxonomy hint applied to every item from that page; left
// undefined where a department mixes garment types Castro doesn't split
// out for us (underwear+socks, dresses+skirts, kindergarten bundles) --
// classifyCatalog() then reads the actual garment type off each title
// instead, the same fallback Fox's uncategorised third already relies on.
export const castroAdapter = createIdusAdapter({
  key: "castro",
  name: "קסטרו קידס",
  nameEn: "Castro Kids",
  baseUrl: BASE_URL,
  // /favicon.ico does resolve here, but points at the same asset as this
  // explicit path -- spelled out so it's obvious which real brand mark is
  // being shown (the round handwritten "Castro" logo) rather than relying
  // on whatever the default favicon route happens to serve.
  logoUrl: `${BASE_URL}/pub/media/favicon/websites/1/favicon-castro.png`,
  // castro.com/robots.txt is `Allow: /` with a single narrow disallow
  // (/catalogsearch/result/?q=), so paging through a category is fine here
  // -- unlike Papaya. Verified against the live file.
  paginated: true,
  categoryPaths: [
    { path: "ילדים/חולצות-גופיות", category: "חולצות", storeGender: "בנים" },
    { path: "ילדים/מכנסיים", category: "מכנסיים", storeGender: "בנים" },
    { path: "ילדים/מעילים-וגקטים", category: "מעיל", storeGender: "בנים" },
    { path: "ילדים/נעליים", category: "נעל", storeGender: "בנים" },
    { path: "ילדים/סריגים-ופוטרים", category: "סריג", storeGender: "בנים" },
    { path: "ילדים/הלבשה-תחתונה", storeGender: "בנים" },
    { path: "ילדים/חליפות-גן", storeGender: "בנים" },
    { path: "ילדות/חולצות", category: "חולצות", storeGender: "בנות" },
    { path: "ילדות/מכנסיים", category: "מכנסיים", storeGender: "בנות" },
    { path: "ילדות/מעילים-וגקטים", category: "מעיל", storeGender: "בנות" },
    { path: "ילדות/נעליים", category: "נעל", storeGender: "בנות" },
    { path: "ילדות/סריגים-ופוטרים", category: "סריג", storeGender: "בנות" },
    { path: "ילדות/הלבשה-תחתונה", storeGender: "בנות" },
    { path: "ילדות/שמלות-חצאיות", storeGender: "בנות" },
    { path: "ילדות/מארזים-חליפות-גן", storeGender: "בנות" },
    { path: "תינוקות/תינוק", storeGender: "בנים" },
    { path: "תינוקות/תינוקת", storeGender: "בנות" },
    { path: "תינוקות/ניובורן-עד-שנה-מארזים" },
  ],
});
