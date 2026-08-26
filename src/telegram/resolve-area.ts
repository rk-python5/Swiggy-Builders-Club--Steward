import type { SavedAddress } from "../web/settings/addresses.js";

export type AreaAnchor =
  | { kind: "address"; addressId: string; label: string }
  | { kind: "coordinates"; latitude: number; longitude: number; label: string };

/**
 * search_restaurants_dineout does NOT geocode area names -- confirmed live against its
 * real input schema (2026-08-26, see DECISIONS.md). It takes addressId OR raw lat/long;
 * an unrecognised area name has to resolve to coordinates before the tool ever sees it,
 * or the tool's own guidance applies: "ask the user rather than guessing a different
 * city." This table is deliberately tiny -- the handful of major-metro anchors Swiggy's
 * own tool description uses as examples, plus one more well-known one. It is NOT a
 * geocoder; anything not in here (or in the user's saved addresses) gets asked back,
 * never silently guessed.
 */
const KNOWN_AREAS: Record<string, { latitude: number; longitude: number }> = {
  bangalore: { latitude: 12.9716, longitude: 77.5946 },
  bengaluru: { latitude: 12.9716, longitude: 77.5946 },
  koramangala: { latitude: 12.9352, longitude: 77.6245 },
  indiranagar: { latitude: 12.9784, longitude: 77.6408 },
  mumbai: { latitude: 19.076, longitude: 72.8777 },
  bandra: { latitude: 19.0596, longitude: 72.8295 },
  delhi: { latitude: 28.6139, longitude: 77.209 },
};

/**
 * Resolution order: (1) fuzzy match against the user's own saved addresses -- most
 * precise, and it's real account data, not a guess; (2) the small known-areas table;
 * (3) null, meaning the bot has to ask rather than pick something.
 */
export function resolveArea(areaHint: string, savedAddresses: SavedAddress[]): AreaAnchor | null {
  const needle = areaHint.trim().toLowerCase();
  if (!needle) return null;

  const addressMatch = savedAddresses.find(
    (a) => a.addressTag?.toLowerCase().includes(needle) || a.addressLine?.toLowerCase().includes(needle),
  );
  if (addressMatch) {
    return { kind: "address", addressId: addressMatch.id, label: addressMatch.addressTag || addressMatch.addressLine };
  }

  const known = KNOWN_AREAS[needle];
  if (known) {
    return { kind: "coordinates", ...known, label: areaHint };
  }

  return null;
}
