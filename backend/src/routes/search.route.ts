import { Router } from "express";
import { search } from "../services/search.service";

export const searchRoute = Router();

searchRoute.get("/search", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q : "";
  if (!q.trim()) {
    res.status(400).json({ error: "Missing required query param: q" });
    return;
  }

  try {
    const result = await search(q);
    res.json(result);
  } catch (err) {
    console.error("[/api/search] failed:", err);
    res.status(500).json({ error: "Search failed" });
  }
});
