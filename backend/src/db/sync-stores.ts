import { prisma } from "./prisma";
import { StoreAdapter } from "../scrapers/types";

// Upserts one Store row per active adapter so Listings have something to
// point at. Run once at boot -- cheap, and search requests then only need
// a read.
export async function syncStores(adapters: StoreAdapter[]): Promise<void> {
  for (const adapter of adapters) {
    await prisma.store.upsert({
      where: { key: adapter.key },
      update: {
        name: adapter.name,
        baseUrl: adapter.baseUrl,
        logoUrl: adapter.logoUrl,
        isLive: adapter.isLive,
        active: true,
      },
      create: {
        key: adapter.key,
        name: adapter.name,
        baseUrl: adapter.baseUrl,
        logoUrl: adapter.logoUrl,
        isLive: adapter.isLive,
        active: true,
      },
    });
  }
}
