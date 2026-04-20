// Search-indexability signals for detail pages (member / group / company).
//
// Purpose: decide whether a page is worth exposing to Google (sitemap,
// prerender, <meta robots>) and whether it has enough substance to host ads.
// Intentionally Angular-free so a mirror can be kept in scripts/ for the
// Node-side prerender/sitemap generator. If you edit the thresholds below,
// mirror the change in scripts/indexability.mjs.

export interface IndexabilitySignals {
  /** At least one activity/affiliation record is attached. */
  hasHistory: boolean;
  /** A representative photo is set. */
  hasPhoto: boolean;
  /** Free-text notes / description is non-empty (whitespace-only does not count). */
  hasNotes: boolean;
  /** At least one social or external URL is available. */
  hasExternalLink: boolean;
  /** A meaningful cross-entity relation (e.g. company_id) is set. */
  hasRelation: boolean;
}

function nonEmptyText(value: string | null | undefined): boolean {
  return !!value && value.trim().length > 0;
}

export function memberIndexabilitySignals(
  member: {
    photo_url: string | null;
    notes: string | null;
    instagram: string | null;
    facebook: string | null;
    x: string | null;
    maid_url: string | null;
    company_id: string | null;
  },
  historyCount: number,
): IndexabilitySignals {
  return {
    hasHistory: historyCount >= 1,
    hasPhoto: !!member.photo_url,
    hasNotes: nonEmptyText(member.notes),
    hasExternalLink: !!(member.instagram || member.facebook || member.x || member.maid_url),
    hasRelation: !!member.company_id,
  };
}

export function groupIndexabilitySignals(
  group: {
    photo_url: string | null;
    notes: string | null;
    instagram: string | null;
    facebook: string | null;
    x: string | null;
    youtube: string | null;
    company_id: string | null;
  },
  memberHistoryCount: number,
): IndexabilitySignals {
  return {
    hasHistory: memberHistoryCount >= 1,
    hasPhoto: !!group.photo_url,
    hasNotes: nonEmptyText(group.notes),
    hasExternalLink: !!(group.instagram || group.facebook || group.x || group.youtube),
    hasRelation: !!group.company_id,
  };
}

export function companyIndexabilitySignals(
  company: {
    photo_url: string | null;
    description: string | null;
    instagram: string | null;
    facebook: string | null;
    x: string | null;
    youtube: string | null;
    website: string | null;
  },
  affiliatedEntityCount: number,
): IndexabilitySignals {
  return {
    hasHistory: affiliatedEntityCount >= 1,
    hasPhoto: !!company.photo_url,
    hasNotes: nonEmptyText(company.description),
    hasExternalLink: !!(company.website || company.instagram || company.facebook || company.x || company.youtube),
    // Companies don't have an extra relation field beyond their affiliations,
    // which are already captured in hasHistory.
    hasRelation: false,
  };
}

function supportingCount(s: IndexabilitySignals): number {
  let n = 0;
  if (s.hasPhoto) n++;
  if (s.hasNotes) n++;
  if (s.hasExternalLink) n++;
  if (s.hasRelation) n++;
  return n;
}

/**
 * A page is indexable when it has at least one "primary" signal (actual
 * content: history or free-text notes) AND at least one supporting signal
 * (photo, external link, or relation). This keeps sparse-shell pages out of
 * the sitemap while still letting minimally-documented entities in.
 */
export function isIndexable(s: IndexabilitySignals): boolean {
  const hasPrimary = s.hasHistory || s.hasNotes;
  const hasSupporting = s.hasPhoto || s.hasExternalLink || s.hasRelation;
  return hasPrimary && hasSupporting;
}

/**
 * Ad eligibility is stricter than indexability: history is mandatory and at
 * least two supporting signals must be present. The goal is to avoid placing
 * AdSense units on thin pages, which is a common rejection reason.
 */
export function isAdEligible(s: IndexabilitySignals): boolean {
  if (!s.hasHistory) return false;
  return supportingCount(s) >= 2;
}
