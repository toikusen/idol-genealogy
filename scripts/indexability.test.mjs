// Node-native test for scripts/indexability.mjs.
// Run with: node --test scripts/indexability.test.mjs
//
// These mirror src/app/core/indexability.utils.spec.ts. If you add or change
// a case here, update the Angular spec too (and vice versa).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  memberIndexabilitySignals,
  groupIndexabilitySignals,
  companyIndexabilitySignals,
  isIndexable,
  isAdEligible,
} from './indexability.mjs';

const baseMember = {
  photo_url: null, notes: null, instagram: null, facebook: null, x: null, maid_url: null, company_id: null,
};

describe('memberIndexabilitySignals', () => {
  it('returns all false for an empty member with no history', () => {
    const s = memberIndexabilitySignals(baseMember, 0);
    assert.equal(s.hasHistory, false);
    assert.equal(s.hasPhoto, false);
    assert.equal(s.hasNotes, false);
    assert.equal(s.hasExternalLink, false);
    assert.equal(s.hasRelation, false);
  });

  it('hasHistory when historyCount >= 1', () => {
    assert.equal(memberIndexabilitySignals(baseMember, 1).hasHistory, true);
    assert.equal(memberIndexabilitySignals(baseMember, 5).hasHistory, true);
  });

  it('hasPhoto when photo_url is set', () => {
    assert.equal(memberIndexabilitySignals({ ...baseMember, photo_url: 'https://x/a.jpg' }, 0).hasPhoto, true);
  });

  it('hasNotes ignores whitespace-only text', () => {
    assert.equal(memberIndexabilitySignals({ ...baseMember, notes: 'bio' }, 0).hasNotes, true);
    assert.equal(memberIndexabilitySignals({ ...baseMember, notes: '' }, 0).hasNotes, false);
    assert.equal(memberIndexabilitySignals({ ...baseMember, notes: '  \n  ' }, 0).hasNotes, false);
  });

  it('hasExternalLink for any social URL', () => {
    assert.equal(memberIndexabilitySignals({ ...baseMember, instagram: 'ig' }, 0).hasExternalLink, true);
    assert.equal(memberIndexabilitySignals({ ...baseMember, facebook: 'fb' }, 0).hasExternalLink, true);
    assert.equal(memberIndexabilitySignals({ ...baseMember, x: 'x' }, 0).hasExternalLink, true);
    assert.equal(memberIndexabilitySignals({ ...baseMember, maid_url: 'https://m' }, 0).hasExternalLink, true);
  });

  it('hasRelation when company_id is set', () => {
    assert.equal(memberIndexabilitySignals({ ...baseMember, company_id: 'c1' }, 0).hasRelation, true);
  });
});

const baseGroup = {
  photo_url: null, notes: null, instagram: null, facebook: null, x: null, youtube: null, company_id: null,
};

describe('groupIndexabilitySignals', () => {
  it('returns all false for an empty group', () => {
    const s = groupIndexabilitySignals(baseGroup, 0);
    assert.equal(s.hasHistory, false);
    assert.equal(s.hasPhoto, false);
    assert.equal(s.hasNotes, false);
    assert.equal(s.hasExternalLink, false);
    assert.equal(s.hasRelation, false);
  });

  it('hasHistory when memberHistoryCount >= 1', () => {
    assert.equal(groupIndexabilitySignals(baseGroup, 1).hasHistory, true);
  });

  it('hasExternalLink includes youtube', () => {
    assert.equal(groupIndexabilitySignals({ ...baseGroup, youtube: 'https://y' }, 0).hasExternalLink, true);
  });

  it('hasRelation reflects company_id', () => {
    assert.equal(groupIndexabilitySignals({ ...baseGroup, company_id: 'c1' }, 0).hasRelation, true);
  });
});

const baseCompany = {
  photo_url: null, description: null, instagram: null, facebook: null, x: null, youtube: null, website: null,
};

describe('companyIndexabilitySignals', () => {
  it('returns all false for an empty company', () => {
    const s = companyIndexabilitySignals(baseCompany, 0);
    assert.equal(s.hasHistory, false);
    assert.equal(s.hasPhoto, false);
    assert.equal(s.hasNotes, false);
    assert.equal(s.hasExternalLink, false);
    assert.equal(s.hasRelation, false);
  });

  it('hasHistory when at least one affiliated entity exists', () => {
    assert.equal(companyIndexabilitySignals(baseCompany, 1).hasHistory, true);
  });

  it('hasNotes reflects description (whitespace-only treated as empty)', () => {
    assert.equal(companyIndexabilitySignals({ ...baseCompany, description: '簡介' }, 0).hasNotes, true);
    assert.equal(companyIndexabilitySignals({ ...baseCompany, description: '   ' }, 0).hasNotes, false);
  });

  it('hasExternalLink covers website and socials', () => {
    assert.equal(companyIndexabilitySignals({ ...baseCompany, website: 'https://co' }, 0).hasExternalLink, true);
    assert.equal(companyIndexabilitySignals({ ...baseCompany, instagram: 'ig' }, 0).hasExternalLink, true);
  });

  it('hasRelation stays false for companies', () => {
    assert.equal(companyIndexabilitySignals(baseCompany, 10).hasRelation, false);
  });
});

const emptySignals = {
  hasHistory: false, hasPhoto: false, hasNotes: false, hasExternalLink: false, hasRelation: false,
};

describe('isIndexable', () => {
  it('returns false when no signals are present', () => {
    assert.equal(isIndexable(emptySignals), false);
  });

  it('returns false with only supporting signals', () => {
    assert.equal(isIndexable({ ...emptySignals, hasPhoto: true }), false);
    assert.equal(isIndexable({ ...emptySignals, hasExternalLink: true }), false);
    assert.equal(isIndexable({ ...emptySignals, hasRelation: true }), false);
    assert.equal(isIndexable({ ...emptySignals, hasPhoto: true, hasRelation: true }), false);
  });

  it('returns false with only a primary signal', () => {
    assert.equal(isIndexable({ ...emptySignals, hasHistory: true }), false);
    assert.equal(isIndexable({ ...emptySignals, hasNotes: true }), false);
  });

  it('returns true with at least one primary and one supporting', () => {
    assert.equal(isIndexable({ ...emptySignals, hasHistory: true, hasPhoto: true }), true);
    assert.equal(isIndexable({ ...emptySignals, hasHistory: true, hasExternalLink: true }), true);
    assert.equal(isIndexable({ ...emptySignals, hasHistory: true, hasRelation: true }), true);
    assert.equal(isIndexable({ ...emptySignals, hasNotes: true, hasRelation: true }), true);
  });
});

describe('isAdEligible', () => {
  it('returns false when signals are empty', () => {
    assert.equal(isAdEligible(emptySignals), false);
  });

  it('returns false when history is missing even if other signals are rich', () => {
    assert.equal(isAdEligible({
      hasHistory: false, hasPhoto: true, hasNotes: true, hasExternalLink: true, hasRelation: true,
    }), false);
  });

  it('returns false with history but fewer than 2 supporting signals', () => {
    assert.equal(isAdEligible({ ...emptySignals, hasHistory: true }), false);
    assert.equal(isAdEligible({ ...emptySignals, hasHistory: true, hasPhoto: true }), false);
    assert.equal(isAdEligible({ ...emptySignals, hasHistory: true, hasRelation: true }), false);
  });

  it('returns true with history and 2+ supporting signals', () => {
    assert.equal(isAdEligible({ ...emptySignals, hasHistory: true, hasPhoto: true, hasExternalLink: true }), true);
    assert.equal(isAdEligible({ ...emptySignals, hasHistory: true, hasNotes: true, hasRelation: true }), true);
    assert.equal(isAdEligible({
      hasHistory: true, hasPhoto: true, hasNotes: true, hasExternalLink: true, hasRelation: true,
    }), true);
  });

  it('any ad-eligible signal set is also indexable', () => {
    const rich = { hasHistory: true, hasPhoto: true, hasNotes: false, hasExternalLink: true, hasRelation: false };
    assert.equal(isAdEligible(rich), true);
    assert.equal(isIndexable(rich), true);
  });
});
