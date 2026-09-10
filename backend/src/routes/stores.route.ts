import { Router } from "express";
import { prisma } from "../db/prisma";

export const storesRoute = Router();

storesRoute.get("/stores", async (_req, res) => {
  const stores = await prisma.store.findMany({
    where: { active: true },
    include: { _count: { select: { products: true } } },
  });

  res.json({
    stores: stores.map((s) => ({
      key: s.key,
      name: s.name,
      baseUrl: s.baseUrl,
      logoUrl: s.logoUrl,
      isLive: s.isLive,
      productCount: s._count.products,
    })),
  });
});
