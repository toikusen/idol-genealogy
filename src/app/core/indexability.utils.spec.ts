import {
  memberIndexabilitySignals,
  groupIndexabilitySignals,
  companyIndexabilitySignals,
  isAdEligible,
  IndexabilitySignals,
  MIN_AD_TEXT_LENGTH,
} from './indexability.utils';

const baseMember = {
  photo_url: null as string | null,
  notes: null as string | null,
  instagram: null as string | null,
  facebook: null as string | null,
  x: null as string | null,
  maid_url: null as string | null,
  company_id: null as string | null,
};

describe('memberIndexabilitySignals', () => {
  it('returns all false for an empty member with no history', () => {
    const s = memberIndexabilitySignals(baseMember, 0);
    expect(s.hasHistory).toBeFalse();
    expect(s.hasPhoto).toBeFalse();
    expect(s.hasNotes).toBeFalse();
    expect(s.hasExternalLink).toBeFalse();
    expect(s.hasRelation).toBeFalse();
  });

  it('hasHistory is true when historyCount >= 1', () => {
    expect(memberIndexabilitySignals(baseMember, 1).hasHistory).toBeTrue();
    expect(memberIndexabilitySignals(baseMember, 7).hasHistory).toBeTrue();
  });

  it('hasPhoto reflects photo_url presence', () => {
    expect(memberIndexabilitySignals({ ...baseMember, photo_url: 'https://x/a.jpg' }, 0).hasPhoto).toBeTrue();
  });

  it('hasNotes treats whitespace-only notes as empty', () => {
    const withNotes = memberIndexabilitySignals({ ...baseMember, notes: ' some bio ' }, 0);
    expect(withNotes.hasNotes).toBeTrue();
    expect(withNotes.noteLength).toBe(8);

    const emptyNotes = memberIndexabilitySignals({ ...baseMember, notes: '' }, 0);
    expect(emptyNotes.hasNotes).toBeFalse();
    expect(emptyNotes.noteLength).toBe(0);

    const whitespaceNotes = memberIndexabilitySignals({ ...baseMember, notes: '   \n  ' }, 0);
    expect(whitespaceNotes.hasNotes).toBeFalse();
    expect(whitespaceNotes.noteLength).toBe(0);

    const placeholderNotes = memberIndexabilitySignals({ ...baseMember, notes: '測試' }, 0);
    expect(placeholderNotes.hasNotes).toBeFalse();
    expect(placeholderNotes.noteLength).toBe(0);
  });

  it('hasExternalLink is true when any social URL is present', () => {
    expect(memberIndexabilitySignals({ ...baseMember, instagram: 'ig' }, 0).hasExternalLink).toBeTrue();
    expect(memberIndexabilitySignals({ ...baseMember, facebook: 'fb' }, 0).hasExternalLink).toBeTrue();
    expect(memberIndexabilitySignals({ ...baseMember, x: 'x' }, 0).hasExternalLink).toBeTrue();
    expect(memberIndexabilitySignals({ ...baseMember, maid_url: 'https://m/a' }, 0).hasExternalLink).toBeTrue();
  });

  it('hasRelation is true when company_id is set', () => {
    expect(memberIndexabilitySignals({ ...baseMember, company_id: 'c1' }, 0).hasRelation).toBeTrue();
  });
});

const baseGroup = {
  photo_url: null as string | null,
  notes: null as string | null,
  instagram: null as string | null,
  facebook: null as string | null,
  x: null as string | null,
  youtube: null as string | null,
  youtube_channel_id: null as string | null,
  company_id: null as string | null,
};

describe('groupIndexabilitySignals', () => {
  it('returns all false for an empty group with no member history', () => {
    const s = groupIndexabilitySignals(baseGroup, 0);
    expect(s.hasHistory).toBeFalse();
    expect(s.hasPhoto).toBeFalse();
    expect(s.hasNotes).toBeFalse();
    expect(s.hasExternalLink).toBeFalse();
    expect(s.hasRelation).toBeFalse();
  });

  it('hasHistory is true when memberHistoryCount >= 1', () => {
    expect(groupIndexabilitySignals(baseGroup, 1).hasHistory).toBeTrue();
  });

  it('hasExternalLink includes youtube', () => {
    expect(groupIndexabilitySignals({ ...baseGroup, youtube: 'https://y' }, 0).hasExternalLink).toBeTrue();
  });

  it('hasRelation reflects company_id presence', () => {
    expect(groupIndexabilitySignals({ ...baseGroup, company_id: 'c1' }, 0).hasRelation).toBeTrue();
  });
});

const baseCompany = {
  photo_url: null as string | null,
  description: null as string | null,
  instagram: null as string | null,
  facebook: null as string | null,
  x: null as string | null,
  youtube: null as string | null,
  youtube_channel_id: null as string | null,
  website: null as string | null,
};

describe('companyIndexabilitySignals', () => {
  it('returns all false for an empty company with no affiliations', () => {
    const s = companyIndexabilitySignals(baseCompany, 0);
    expect(s.hasHistory).toBeFalse();
    expect(s.hasPhoto).toBeFalse();
    expect(s.hasNotes).toBeFalse();
    expect(s.hasExternalLink).toBeFalse();
    expect(s.hasRelation).toBeFalse();
  });

  it('hasHistory is true when at least one group or solo member is affiliated', () => {
    expect(companyIndexabilitySignals(baseCompany, 1).hasHistory).toBeTrue();
  });

  it('hasNotes reflects description presence', () => {
    expect(companyIndexabilitySignals({ ...baseCompany, description: '公司簡介' }, 0).hasNotes).toBeTrue();
    expect(companyIndexabilitySignals({ ...baseCompany, description: '   ' }, 0).hasNotes).toBeFalse();
  });

  it('hasExternalLink includes website and socials', () => {
    expect(companyIndexabilitySignals({ ...baseCompany, website: 'https://co' }, 0).hasExternalLink).toBeTrue();
    expect(companyIndexabilitySignals({ ...baseCompany, instagram: 'ig' }, 0).hasExternalLink).toBeTrue();
  });

  it('hasRelation reflects affiliation presence (roster is both primary and supporting)', () => {
    expect(companyIndexabilitySignals(baseCompany, 0).hasRelation).toBeFalse();
    expect(companyIndexabilitySignals(baseCompany, 1).hasRelation).toBeTrue();
    expect(companyIndexabilitySignals(baseCompany, 10).hasRelation).toBeTrue();
  });

});

const emptySignals: IndexabilitySignals = {
  hasHistory: false,
  hasPhoto: false,
  hasNotes: false,
  noteLength: 0,
  hasExternalLink: false,
  hasRelation: false,
};

describe('isAdEligible', () => {
  it('returns false when signals are empty', () => {
    expect(isAdEligible(emptySignals)).toBeFalse();
  });

  it('returns false when notes are missing even with rich evidence', () => {
    expect(isAdEligible({
      hasHistory: true, hasPhoto: true, hasNotes: false, noteLength: 0, hasExternalLink: true, hasRelation: true,
    })).toBeFalse();
  });

  it('returns false when history is missing, even if other signals are rich', () => {
    expect(isAdEligible({
      hasHistory: false, hasPhoto: true, hasNotes: true, noteLength: MIN_AD_TEXT_LENGTH, hasExternalLink: true, hasRelation: true,
    })).toBeFalse();
  });

  it('returns false when notes are shorter than the ad text threshold', () => {
    expect(isAdEligible({
      ...emptySignals,
      hasHistory: true,
      hasNotes: true,
      noteLength: MIN_AD_TEXT_LENGTH - 1,
      hasPhoto: true,
    })).toBeFalse();
  });

  it('returns false with substantial notes but no supporting signal', () => {
    expect(isAdEligible({
      ...emptySignals,
      hasHistory: true,
      hasNotes: true,
      noteLength: MIN_AD_TEXT_LENGTH,
    })).toBeFalse();
  });

  it('returns true with history, substantial notes and at least one supporting signal', () => {
    expect(isAdEligible({
      ...emptySignals,
      hasHistory: true,
      hasNotes: true,
      noteLength: MIN_AD_TEXT_LENGTH,
      hasPhoto: true,
    })).toBeTrue();
    expect(isAdEligible({
      ...emptySignals,
      hasHistory: true,
      hasNotes: true,
      noteLength: MIN_AD_TEXT_LENGTH,
      hasExternalLink: true,
    })).toBeTrue();
    expect(isAdEligible({
      ...emptySignals,
      hasHistory: true,
      hasNotes: true,
      noteLength: MIN_AD_TEXT_LENGTH,
      hasRelation: true,
    })).toBeTrue();
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
    expect(isAdEligible(rich)).toBeTrue();
  });
});
