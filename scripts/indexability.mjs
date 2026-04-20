// Node/JS mirror of src/app/core/indexability.utils.ts.
// Keep the two files in sync — they share spec coverage (see
// scripts/indexability.test.mjs and src/app/core/indexability.utils.spec.ts).
// This file is imported by the pre-build script that generates
// prerender-routes.txt and sitemap.xml, so it cannot depend on Angular.

/**
 * @typedef {Object} IndexabilitySignals
 * @property {boolean} hasHistory
 * @property {boolean} hasPhoto
 * @property {boolean} hasNotes
 * @property {boolean} hasExternalLink
 * @property {boolean} hasRelation
 */

function nonEmptyText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function memberIndexabilitySignals(member, historyCount) {
  return {
    hasHistory: historyCount >= 1,
    hasPhoto: !!member.photo_url,
    hasNotes: nonEmptyText(member.notes),
    hasExternalLink: !!(member.instagram || member.facebook || member.x || member.maid_url),
    hasRelation: !!member.company_id,
  };
}

export function groupIndexabilitySignals(group, memberHistoryCount) {
  return {
    hasHistory: memberHistoryCount >= 1,
    hasPhoto: !!group.photo_url,
    hasNotes: nonEmptyText(group.notes),
    hasExternalLink: !!(group.instagram || group.facebook || group.x || group.youtube),
    hasRelation: !!group.company_id,
  };
}

export function companyIndexabilitySignals(company, affiliatedEntityCount) {
  return {
    hasHistory: affiliatedEntityCount >= 1,
    hasPhoto: !!company.photo_url,
    hasNotes: nonEmptyText(company.description),
    hasExternalLink: !!(company.website || company.instagram || company.facebook || company.x || company.youtube),
    hasRelation: affiliatedEntityCount >= 1,
  };
}

function supportingCount(s) {
  let n = 0;
  if (s.hasPhoto) n++;
  if (s.hasNotes) n++;
  if (s.hasExternalLink) n++;
  if (s.hasRelation) n++;
  return n;
}

export function isIndexable(s) {
  const hasPrimary = s.hasHistory || s.hasNotes;
  const hasSupporting = s.hasPhoto || s.hasExternalLink || s.hasRelation;
  return hasPrimary && hasSupporting;
}

export function isAdEligible(s) {
  if (!s.hasHistory) return false;
  return supportingCount(s) >= 2;
}
