// Shared demo catalog used by the mock adapters. This is what makes
// MarketS work end-to-end out of the box with zero network access --
// no live site, no API keys. Swap/extend freely, or delete once real
// adapters are wired up.

export interface CatalogItem {
  title: string;
  brand: string;
  category: string;
  keywords: string[];
  basePrice: number; // ILS
  imageUrl: string;
}

export const CATALOG: CatalogItem[] = [
  {
    title: 'Apple iPhone 15 128GB',
    brand: "Apple",
    category: "סמארטפונים",
    keywords: ["iphone", "15", "אייפון", "אפל", "apple"],
    basePrice: 3499,
    imageUrl: "https://picsum.photos/seed/iphone15/200",
  },
  {
    title: 'Samsung Galaxy S24 256GB',
    brand: "Samsung",
    category: "סמארטפונים",
    keywords: ["galaxy", "s24", "סמסונג", "samsung"],
    basePrice: 3699,
    imageUrl: "https://picsum.photos/seed/s24/200",
  },
  {
    title: 'Apple MacBook Air M2 13"',
    brand: "Apple",
    category: "מחשבים ניידים",
    keywords: ["macbook", "air", "m2", "מקבוק", "אפל", "apple"],
    basePrice: 4999,
    imageUrl: "https://picsum.photos/seed/macbookair/200",
  },
  {
    title: "Sony WH-1000XM5 אוזניות אלחוטיות",
    brand: "Sony",
    category: "אוזניות",
    keywords: ["sony", "wh-1000xm5", "אוזניות", "סוני"],
    basePrice: 1299,
    imageUrl: "https://picsum.photos/seed/sonywh1000/200",
  },
  {
    title: "מכונת כביסה Samsung 9 ק\"ג",
    brand: "Samsung",
    category: "מוצרי חשמל",
    keywords: ["מכונת", "כביסה", "samsung", "סמסונג"],
    basePrice: 2199,
    imageUrl: "https://picsum.photos/seed/washer/200",
  },
  {
    title: "מקרר Electra No Frost 470 ליטר",
    brand: "Electra",
    category: "מוצרי חשמל",
    keywords: ["מקרר", "electra", "אלקטרה", "no frost"],
    basePrice: 3899,
    imageUrl: "https://picsum.photos/seed/fridge/200",
  },
  {
    title: "נעלי ספורט Nike Air Max",
    brand: "Nike",
    category: "אופנה",
    keywords: ["נעלי", "ספורט", "nike", "air max", "נייק"],
    basePrice: 599,
    imageUrl: "https://picsum.photos/seed/nikeairmax/200",
  },
  {
    title: "טלוויזיה LG OLED 55 אינץ'",
    brand: "LG",
    category: "טלוויזיות",
    keywords: ["טלוויזיה", "lg", "oled", "55"],
    basePrice: 4299,
    imageUrl: "https://picsum.photos/seed/lgoled55/200",
  },
  {
    title: "שואב אבק רובוטי Xiaomi Robot Vacuum",
    brand: "Xiaomi",
    category: "מוצרי חשמל",
    keywords: ["שואב", "אבק", "רובוט", "xiaomi", "שיאומי"],
    basePrice: 1099,
    imageUrl: "https://picsum.photos/seed/robovac/200",
  },
  {
    title: "קפסולות קפה Nespresso Vertuo",
    brand: "Nespresso",
    category: "מטבח",
    keywords: ["קפה", "נספרסו", "nespresso", "vertuo", "קפסולות"],
    basePrice: 89,
    imageUrl: "https://picsum.photos/seed/nespresso/200",
  },
];
