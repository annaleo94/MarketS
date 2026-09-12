import { CatalogAdapter } from "./types";
import { foxAdapter } from "./adapters/fox.adapter";
import { shilavAdapter } from "./adapters/shilav.adapter";
import { cartersAdapter } from "./adapters/carters.adapter";
import { castroAdapter } from "./adapters/castro.adapter";
import { nimrodAdapter } from "./adapters/nimrod.adapter";
import { papayaAdapter } from "./adapters/papaya.adapter";

// The stores in the baby/kids pilot. All real data -- see each adapter
// file for how it was verified. The first four sell clothing; נעלי נמרוד
// and פפאיה are footwear, which is why sizes.ts has to keep the EU shoe
// scale and the age scale apart.
export const catalogAdapters: CatalogAdapter[] = [
  foxAdapter,
  shilavAdapter,
  cartersAdapter,
  castroAdapter,
  nimrodAdapter,
  papayaAdapter,
];
