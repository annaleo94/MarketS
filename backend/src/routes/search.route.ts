import { Router } from "express";
import { search } from "../services/search.service";

export const searchRoute = Router();

searchRoute.get("/search", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q : "";
  if (!q.trim()) {
    res.status(400).json({ error: "Missing required query param: q" });
    return;
  }

  // Filter chips are removable: dropping one re-runs the same search
  // without that constraint, so a mis-parsed query is fixable by the
  // shopper instead of just looking like empty stock.
  const dropped = String(req.query.drop ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const overrides: Record<string, null> = {};
  if (dropped.includes("category")) overrides.categorySlug = null;
  if (dropped.includes("size")) overrides.size = null;
  if (dropped.includes("gender")) overrides.gender = null;
  if (dropped.includes("color")) overrides.color = null;
  if (dropped.includes("legStyle")) overrides.legStyle = null;

  try {
    const result = await search(q, overrides);
    res.json(result);
  } catch (err) {
    console.error("[/api/search] failed:", err);
    res.status(500).json({ error: "Search failed" });
  }
});
