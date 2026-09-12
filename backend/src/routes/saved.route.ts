import { Router } from "express";
import { prisma } from "../db/prisma";

export const savedRoute = Router();

// A shopper's saved list lives in their own browser -- there are no
// accounts here -- so the browser holds a snapshot of each item as it was
// when they saved it, and this endpoint tells it what those items look
// like now. That's the whole point of saving one: "did it get cheaper
// since I put it aside", "is it still in stock", "did it disappear".
//
// Everything it returns is already public (it's what search returns, plus
// the price history the sync records), so there's nothing to authorise --
// but the id list is capped so a crafted URL can't ask for the catalogue.
const MAX_IDS = 120;

savedRoute.get("/products", async (req, res) => {
  const ids = String(req.query.ids ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_IDS);

  if (ids.length === 0) {
    res.json({ products: [] });
    return;
  }

  const products = await prisma.product.findMany({
    where: { id: { in: ids } },
    include: { store: { select: { key: true, name: true, baseUrl: true, logoUrl: true } } },
  });

  res.json({
    products: products.map((p) => ({
      id: p.id,
      title: p.title,
      price: p.price,
      currency: p.currency,
      url: p.url,
      imageUrl: p.imageUrl,
      inStock: p.inStock,
      sizes: p.sizes,
      // The history the sync keeps. listPrice is the store's own "before"
      // price (so "במבצע" is the store saying so, not us guessing from a
      // price we happened to see once); lowestPrice is the floor across
      // everything we've ever observed, which is what makes "this is the
      // best price it's been" answerable.
      listPrice: p.listPrice,
      lowestPrice: p.lowestPrice,
      // The price this one replaced, so a "ירד מ-₪X ל-₪Y" row has both
      // numbers even for a shopper who saved the product after the drop.
      previousPrice: p.previousPrice,
      // Worked out by the sync, not here: someone who hasn't opened the
      // site for a week must find the badge already up to date, and only
      // the sync knows the feed moved. See catalog/history.ts.
      displayStatus: p.displayStatus ?? "in_stock_unchanged",
      statusChangedAt: p.statusChangedAt,
      // For the side-by-side comparison of saved items. Material isn't in
      // the catalogue -- no store publishes it in a machine-readable way,
      // so the column is simply left out rather than filled with guesses.
      color: p.color,
      colors: p.colors ? p.colors.split(",").filter(Boolean) : [],
      gender: p.gender,
      // A saved product that left its store's feed. Kept rather than
      // deleted precisely so a saved list can say "it's gone" instead of
      // silently dropping the item the shopper was waiting on.
      delisted: p.delistedAt !== null,
      store: p.store,
    })),
  });
});
