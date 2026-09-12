import { useState } from "react";

export interface StoreBadgeInfo {
  name: string; // Hebrew, as the shopper already knows it from this site
  nameEn?: string | null; // the store's own Latin branding
  logoUrl?: string | null;
}

// A store's identity, shown together wherever a store heading appears:
// its logo, its Hebrew name (as already used throughout the site) and its
// own English brand name beside it. The logo is what a shopper's eye
// actually catches first when scanning a page of results -- a name alone
// takes reading, a familiar mark doesn't -- and the English name is the
// store's own branding, not our translation of it, so a shopper who
// already knows "FOX" or "Carter's" recognises it instantly rather than
// having to match our Hebrew rendering to the brand in their head.
export function StoreBadge({ store, size = "md" }: { store: StoreBadgeInfo; size?: "sm" | "md" }) {
  // Every logo here is scraped off the store's own live site (see the
  // adapters), so one changing its asset later is a "the image 404s now"
  // failure this has to survive gracefully -- the badge still needs to
  // read fine as plain text, not as a broken-image icon.
  const [broken, setBroken] = useState(false);

  return (
    <span className={`store-badge store-badge--${size}`}>
      {store.logoUrl && !broken && (
        <span className="store-badge__logo-frame">
          <img
            className="store-badge__logo"
            src={store.logoUrl}
            alt=""
            loading="lazy"
            onError={() => setBroken(true)}
          />
        </span>
      )}
      <span className="store-badge__names">
        <span className="store-badge__he">{store.name}</span>
        {store.nameEn && (
          // dir="ltr" so the Latin brand name doesn't get mirrored by the
          // page's own RTL flow -- it needs to read exactly as the store
          // itself writes it.
          <span className="store-badge__en" dir="ltr">
            {store.nameEn}
          </span>
        )}
      </span>
    </span>
  );
}
