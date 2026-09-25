/**
 * Venue addresses are community-entered free text. Across the current 49 rows
 * the postal code appears as 3, 5 or 6 digits, or not at all, and both 臺 and 台
 * are used for the same cities — so every part here is optional by design.
 */
const ADDRESS_RE = /^\s*(?:\d{3}(?:\d{2,3})?)?\s*(?<city>[^\s\d]{1,3}[市縣])?\s*(?<district>[^\s\d]{1,4}[區鄉鎮市])?/u;

export interface VenueAddressParts {
  city: string | null;
  district: string | null;
}

/** `臺` and `台` are the same city; meta text picks one so titles stay consistent. */
export function normalizeCityChar(value: string): string {
  return value.replace(/臺/g, '台');
}

export function parseVenueAddress(address: string | null | undefined): VenueAddressParts {
  const groups = ADDRESS_RE.exec(address ?? '')?.groups;
  return {
    city: groups?.['city'] ? normalizeCityChar(groups['city']) : null,
    district: groups?.['district'] ? normalizeCityChar(groups['district']) : null,
  };
}

/**
 * `venues.type` is free text and at least one row arrived as "Live\n   House".
 * Collapsing whitespace at read time keeps chips on one line.
 */
export function normalizeVenueType(type: string | null | undefined): string | null {
  const collapsed = (type ?? '').replace(/\s+/g, ' ').trim();
  return collapsed.length > 0 ? collapsed : null;
}

/** Falls back to a Maps search when a venue has no curated `google_maps_url`. */
export function venueMapUrl(venue: { google_maps_url: string | null; address: string }): string {
  return venue.google_maps_url
    ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue.address)}`;
}

const REGION_LABELS: Record<string, string> = { north: '北部', central: '中部', south: '南部' };

export function regionLabel(region: string): string {
  return REGION_LABELS[region] ?? region;
}
