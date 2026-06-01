// Node/JS mirror of src/app/core/indexability.utils.ts.
// Keep the two files in sync — they share spec coverage (see
// scripts/indexability.test.mjs and src/app/core/indexability.utils.spec.ts).
// This file cannot depend on Angular.

export const MIN_AD_TEXT_LENGTH = 80;

/**
 * @typedef {Object} IndexabilitySignals
 * @property {boolean} hasHistory
 * @property {boolean} hasPhoto
 * @property {boolean} hasNotes
 * @property {number} noteLength
 * @property {boolean} hasExternalLink
 * @property {boolean} hasRelation
 */

function isPlaceholderText(value) {
  if (typeof value !== 'string') return false;
  const text = value.trim().toLowerCase();
  return text === '測試' || text === 'test' || text === 'testing' || text === 'todo' || text === '待補' || text === '暫填';
}

function nonEmptyText(value) {
  return typeof value === 'string' && value.trim().length > 0 && !isPlaceholderText(value);
}

function textLength(value) {
  return nonEmptyText(value) ? value.trim().length : 0;
}

export function memberIndexabilitySignals(member, historyCount) {
  return {
    hasHistory: historyCount >= 1,
    hasPhoto: !!member.photo_url,
    hasNotes: nonEmptyText(member.notes),
    noteLength: textLength(member.notes),
    hasExternalLink: !!(member.instagram || member.facebook || member.x || member.maid_url),
    hasRelation: !!member.company_id,
  };
}

export function groupIndexabilitySignals(group, memberHistoryCount) {
  return {
    hasHistory: memberHistoryCount >= 1,
    hasPhoto: !!group.photo_url,
    hasNotes: nonEmptyText(group.notes),
    noteLength: textLength(group.notes),
    hasExternalLink: !!(group.instagram || group.facebook || group.x || group.youtube),
    hasRelation: !!group.company_id,
  };
}

export function companyIndexabilitySignals(company, affiliatedEntityCount) {
  return {
    hasHistory: affiliatedEntityCount >= 1,
    hasPhoto: !!company.photo_url,
    hasNotes: nonEmptyText(company.description),
    noteLength: textLength(company.description),
    hasExternalLink: !!(company.website || company.instagram || company.facebook || company.x || company.youtube),
    hasRelation: affiliatedEntityCount >= 1,
  };
}

function supportingCount(s) {
  let n = 0;
  if (s.hasPhoto) n++;
  if (s.hasExternalLink) n++;
  if (s.hasRelation) n++;
  return n;
}

export function isAdEligible(s) {
  if (!s.hasHistory || !s.hasNotes || s.noteLength < MIN_AD_TEXT_LENGTH) return false;
  return supportingCount(s) >= 1;
}
