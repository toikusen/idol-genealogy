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
  isAdEligible,
  MIN_AD_TEXT_LENGTH,
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
    const withNotes = memberIndexabilitySignals({ ...baseMember, notes: ' bio ' }, 0);
    assert.equal(withNotes.hasNotes, true);
    assert.equal(withNotes.noteLength, 3);

    const emptyNotes = memberIndexabilitySignals({ ...baseMember, notes: '' }, 0);
    assert.equal(emptyNotes.hasNotes, false);
    assert.equal(emptyNotes.noteLength, 0);

    const whitespaceNotes = memberIndexabilitySignals({ ...baseMember, notes: '  \n  ' }, 0);
    assert.equal(whitespaceNotes.hasNotes, false);
    assert.equal(whitespaceNotes.noteLength, 0);

    const placeholderNotes = memberIndexabilitySignals({ ...baseMember, notes: '測試' }, 0);
    assert.equal(placeholderNotes.hasNotes, false);
    assert.equal(placeholderNotes.noteLength, 0);
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

  it('hasRelation reflects affiliation presence (roster is both primary and supporting)', () => {
    assert.equal(companyIndexabilitySignals(baseCompany, 0).hasRelation, false);
    assert.equal(companyIndexabilitySignals(baseCompany, 1).hasRelation, true);
    assert.equal(companyIndexabilitySignals(baseCompany, 10).hasRelation, true);
  });

});

const emptySignals = {
  hasHistory: false, hasPhoto: false, hasNotes: false, noteLength: 0, hasExternalLink: false, hasRelation: false,
};

describe('isAdEligible', () => {
  it('returns false when signals are empty', () => {
    assert.equal(isAdEligible(emptySignals), false);
  });

  it('returns false when notes are missing even with rich evidence', () => {
    assert.equal(isAdEligible({
      hasHistory: true, hasPhoto: true, hasNotes: false, noteLength: 0, hasExternalLink: true, hasRelation: true,
    }), false);
  });

  it('returns false when history is missing even if other signals are rich', () => {
    assert.equal(isAdEligible({
      hasHistory: false, hasPhoto: true, hasNotes: true, noteLength: MIN_AD_TEXT_LENGTH, hasExternalLink: true, hasRelation: true,
    }), false);
  });

  it('returns false when notes are shorter than the ad text threshold', () => {
    assert.equal(isAdEligible({
      ...emptySignals,
      hasHistory: true,
      hasNotes: true,
      noteLength: MIN_AD_TEXT_LENGTH - 1,
      hasPhoto: true,
    }), false);
  });

  it('returns false with substantial notes but no supporting signal', () => {
    assert.equal(isAdEligible({
      ...emptySignals,
      hasHistory: true,
      hasNotes: true,
      noteLength: MIN_AD_TEXT_LENGTH,
    }), false);
  });

  it('returns true with history, substantial notes and at least one supporting signal', () => {
    assert.equal(isAdEligible({
      ...emptySignals,
      hasHistory: true,
      hasNotes: true,
      noteLength: MIN_AD_TEXT_LENGTH,
      hasPhoto: true,
    }), true);
    assert.equal(isAdEligible({
      ...emptySignals,
      hasHistory: true,
      hasNotes: true,
      noteLength: MIN_AD_TEXT_LENGTH,
      hasExternalLink: true,
    }), true);
    assert.equal(isAdEligible({
      ...emptySignals,
      hasHistory: true,
      hasNotes: true,
      noteLength: MIN_AD_TEXT_LENGTH,
      hasRelation: true,
    }), true);
  });

  it('returns true with rich signals', () => {
    const rich = {
      hasHistory: true,
      hasPhoto: true,
      hasNotes: true,
      noteLength: MIN_AD_TEXT_LENGTH,
      hasExternalLink: true,
      hasRelation: false,
    };
    assert.equal(isAdEligible(rich), true);
  });
});
