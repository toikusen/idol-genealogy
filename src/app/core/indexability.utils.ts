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
    // For companies the roster *is* the content: a page with real affiliations
    // has search value even without photos or socials. Mirror hasHistory into
    // hasRelation so affiliation-only company pages still clear isIndexable.
    hasRelation: affiliatedEntityCount >= 1,
  };
}

function supportingCount(s: IndexabilitySignals): number {
  let n = 0;
  if (s.hasPhoto) n++;
  if (s.hasExternalLink) n++;
  if (s.hasRelation) n++;
  return n;
}

function qualityCount(s: IndexabilitySignals): number {
  return supportingCount(s) + (s.hasNotes ? 1 : 0);
}

/**
 * Notes/descriptions are treated as the strongest editorial signal: pages with
 * real prose can be indexed with one additional supporting signal. History-only
 * pages are stricter and must also include a media/external cue plus another
 * support, which keeps bare roster shells out of Google.
 */
export function isIndexable(s: IndexabilitySignals): boolean {
  if (s.hasNotes) {
    return supportingCount(s) >= 1;
  }
  if (!s.hasHistory) return false;
  return supportingCount(s) >= 2 && (s.hasPhoto || s.hasExternalLink);
}

/**
 * Ad eligibility is stricter than indexability: history is mandatory and pages
 * must also have either real prose or both a representative image and an
 * external profile. This keeps ads off thin shells that happen to have roster
 * links only.
 */
export function isAdEligible(s: IndexabilitySignals): boolean {
  if (!s.hasHistory) return false;
  const hasRichContext = s.hasNotes || (s.hasPhoto && s.hasExternalLink);
  return hasRichContext && qualityCount(s) >= 2;
}
