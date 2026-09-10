import { createMockStoreAdapter } from "./mock-store.factory";

// Three demo "stores" with different pricing personalities, so search
// results actually look like a price comparison instead of three identical
// rows. Replace with real adapters (see ./live) when you're ready.
export const mockStoreAdapters = [
  createMockStoreAdapter({
    key: "mock-electro-plus",
    name: "אלקטרו פלוס (הדגמה)",
    baseUrl: "https://electro-plus.example.co.il",
    priceMultiplier: 0.97,
    jitter: 0.05,
    latencyMs: 120,
  }),
  createMockStoreAdapter({
    key: "mock-home-market",
    name: "הום מרקט (הדגמה)",
    baseUrl: "https://home-market.example.co.il",
    priceMultiplier: 1.04,
    jitter: 0.07,
    latencyMs: 200,
  }),
  createMockStoreAdapter({
    key: "mock-value-store",
    name: "ערך טוב (הדגמה)",
    baseUrl: "https://value-store.example.co.il",
    priceMultiplier: 0.9,
    jitter: 0.1,
    latencyMs: 160,
  }),
];
