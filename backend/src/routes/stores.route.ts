import { Router } from "express";
import { getActiveAdapters } from "../scrapers/registry";

export const storesRoute = Router();

storesRoute.get("/stores", (_req, res) => {
  const stores = getActiveAdapters().map((a) => ({
    key: a.key,
    name: a.name,
    baseUrl: a.baseUrl,
    logoUrl: a.logoUrl ?? null,
    isLive: a.isLive,
  }));
  res.json({ stores });
});
