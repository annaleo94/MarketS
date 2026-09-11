import { CatalogAdapter } from "./types";
import { foxAdapter } from "./adapters/fox.adapter";
import { shilavAdapter } from "./adapters/shilav.adapter";
import { cartersAdapter } from "./adapters/carters.adapter";
import { castroAdapter } from "./adapters/castro.adapter";

// The four stores in the baby/kids-clothing pilot. All real data -- see
// each adapter file for how it was verified.
export const catalogAdapters: CatalogAdapter[] = [foxAdapter, shilavAdapter, cartersAdapter, castroAdapter];
