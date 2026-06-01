// Quality signals for detail pages (member / group / company).
//
// Purpose: decide whether a page has enough substance to host ads. Public
// detail pages are still prerendered and indexable even when they are thin.
// Intentionally Angular-free so a mirror can be kept in scripts/ for the
// Node-side tests. If you edit the thresholds below, mirror the change in
// scripts/indexability.mjs.

import { isPlaceholderText } from './public-record.utils';

export const MIN_AD_TEXT_LENGTH = 80;

export interface IndexabilitySignals {
  /** At least one activity/affiliation record is attached. */
  hasHistory: boolean;
  /** A representative photo is set. */
  hasPhoto: boolean;
  /** Free-text notes / description is non-empty (whitespace-only does not count). */
  hasNotes: boolean;
  /** Trimmed character count of notes / description. */
  noteLength: number;
  /** At least one social or external URL is available. */
  hasExternalLink: boolean;
  /** A meaningful cross-entity relation (e.g. company_id) is set. */
  hasRelation: boolean;
}

function nonEmptyText(value: string | null | undefined): boolean {
  return !!value && value.trim().length > 0 && !isPlaceholderText(value);
}

function textLength(value: string | null | undefined): number {
  return nonEmptyText(value) ? value!.trim().length : 0;
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
    noteLength: textLength(member.notes),
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
    noteLength: textLength(group.notes),
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
    noteLength: textLength(company.description),
    hasExternalLink: !!(company.website || company.instagram || company.facebook || company.x || company.youtube),
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

/**
 * Ad eligibility requires substantial editorial prose. Pages with short notes
 * can still be indexable when they meet the evidence bar above, but they do
 * not carry ads — reviewers should only ever see ads beside complete paragraph
 * text, not on pages that are mostly tabular or placeholder-like.
 */
export function isAdEligible(s: IndexabilitySignals): boolean {
  if (!s.hasHistory || !s.hasNotes || s.noteLength < MIN_AD_TEXT_LENGTH) return false;
  return supportingCount(s) >= 1;
}
