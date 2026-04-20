import {
  memberIndexabilitySignals,
  groupIndexabilitySignals,
  companyIndexabilitySignals,
  isIndexable,
  isAdEligible,
  IndexabilitySignals,
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
    expect(memberIndexabilitySignals({ ...baseMember, notes: 'some bio' }, 0).hasNotes).toBeTrue();
    expect(memberIndexabilitySignals({ ...baseMember, notes: '' }, 0).hasNotes).toBeFalse();
    expect(memberIndexabilitySignals({ ...baseMember, notes: '   \n  ' }, 0).hasNotes).toBeFalse();
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

  it('is indexable from affiliations alone (roster-only company)', () => {
    const signals = companyIndexabilitySignals(baseCompany, 3);
    expect(isIndexable(signals)).toBeTrue();
  });
});

const emptySignals: IndexabilitySignals = {
  hasHistory: false,
  hasPhoto: false,
  hasNotes: false,
  hasExternalLink: false,
  hasRelation: false,
};

describe('isIndexable', () => {
  it('returns false when no signals are present', () => {
    expect(isIndexable(emptySignals)).toBeFalse();
  });

  it('returns false when only supporting signals are present (no primary)', () => {
    expect(isIndexable({ ...emptySignals, hasPhoto: true })).toBeFalse();
    expect(isIndexable({ ...emptySignals, hasExternalLink: true })).toBeFalse();
    expect(isIndexable({ ...emptySignals, hasRelation: true })).toBeFalse();
    expect(isIndexable({ ...emptySignals, hasPhoto: true, hasRelation: true })).toBeFalse();
  });

  it('returns false when only a primary signal is present (no supporting)', () => {
    expect(isIndexable({ ...emptySignals, hasHistory: true })).toBeFalse();
    expect(isIndexable({ ...emptySignals, hasNotes: true })).toBeFalse();
  });

  it('returns true when at least one primary and one supporting signal are present', () => {
    expect(isIndexable({ ...emptySignals, hasHistory: true, hasPhoto: true })).toBeTrue();
    expect(isIndexable({ ...emptySignals, hasHistory: true, hasExternalLink: true })).toBeTrue();
    expect(isIndexable({ ...emptySignals, hasHistory: true, hasRelation: true })).toBeTrue();
    expect(isIndexable({ ...emptySignals, hasNotes: true, hasRelation: true })).toBeTrue();
  });
});

describe('isAdEligible', () => {
  it('returns false when signals are empty', () => {
    expect(isAdEligible(emptySignals)).toBeFalse();
  });

  it('returns false when history is missing, even if other signals are rich', () => {
    expect(isAdEligible({
      hasHistory: false, hasPhoto: true, hasNotes: true, hasExternalLink: true, hasRelation: true,
    })).toBeFalse();
  });

  it('returns false when history is present but fewer than 2 supporting signals', () => {
    expect(isAdEligible({ ...emptySignals, hasHistory: true })).toBeFalse();
    expect(isAdEligible({ ...emptySignals, hasHistory: true, hasPhoto: true })).toBeFalse();
    expect(isAdEligible({ ...emptySignals, hasHistory: true, hasRelation: true })).toBeFalse();
  });

  it('returns true when history is present and at least 2 supporting signals are set', () => {
    expect(isAdEligible({ ...emptySignals, hasHistory: true, hasPhoto: true, hasExternalLink: true })).toBeTrue();
    expect(isAdEligible({ ...emptySignals, hasHistory: true, hasNotes: true, hasRelation: true })).toBeTrue();
    expect(isAdEligible({
      hasHistory: true, hasPhoto: true, hasNotes: true, hasExternalLink: true, hasRelation: true,
    })).toBeTrue();
  });

  it('implies isIndexable: any ad-eligible signal set is also indexable', () => {
    const rich = { hasHistory: true, hasPhoto: true, hasNotes: false, hasExternalLink: true, hasRelation: false };
    expect(isAdEligible(rich)).toBeTrue();
    expect(isIndexable(rich)).toBeTrue();
  });
});
