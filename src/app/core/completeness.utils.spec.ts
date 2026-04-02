import { getMemberCompleteness, getGroupCompleteness, getCompanyCompleteness } from './completeness.utils';
import { Member, Group, Company } from '../models';

const baseMember: Member = {
  id: '1', name: '測試', name_roman: null, photo_url: null, color: null,
  color_name: null, birthdate: null, nickname: null, instagram: null,
  facebook: null, x: null, maid_url: null, notes: null, company_id: null,
  updated_at: '', created_at: '',
};

describe('getMemberCompleteness', () => {
  it('returns score 0 and all core missing when all fields null', () => {
    const result = getMemberCompleteness(baseMember);
    expect(result.score).toBe(0);
    expect(result.isComplete).toBeFalse();
    expect(result.missingCoreLabels).toContain('頭像');
    expect(result.missingCoreLabels).toContain('生日');
    expect(result.missingCoreLabels).toContain('英文/拼音名');
    expect(result.missingCoreLabels).toContain('社群帳號');
  });

  it('returns isComplete true when all core fields present', () => {
    const full: Member = { ...baseMember, photo_url: 'url', birthdate: '01-01', name_roman: 'Test', instagram: 'test' };
    const result = getMemberCompleteness(full);
    expect(result.isComplete).toBeTrue();
    expect(result.missingCoreLabels).toEqual([]);
  });

  it('treats having any one social as social requirement met', () => {
    const m: Member = { ...baseMember, facebook: 'fb' };
    const result = getMemberCompleteness(m);
    expect(result.missingCoreLabels).not.toContain('社群帳號');
  });

  it('returns score 100 when all tracked fields present', () => {
    const full: Member = {
      ...baseMember,
      photo_url: 'url', birthdate: '01-01', name_roman: 'Test',
      instagram: 'ig', nickname: 'nick', color: '#fff', color_name: '白',
    };
    expect(getMemberCompleteness(full).score).toBe(100);
  });

  it('returns partial score proportional to filled fields', () => {
    // 7 tracked fields: photo_url, birthdate, name_roman, hasSocial, nickname, color, color_name
    // fill 4 of 7 → ~57%
    const m: Member = { ...baseMember, photo_url: 'url', birthdate: '01-01', name_roman: 'Test', instagram: 'ig' };
    const result = getMemberCompleteness(m);
    expect(result.score).toBe(Math.round(4 / 7 * 100));
  });
});

const baseGroup: Group = {
  id: '1', name: '測試團', name_jp: null, photo_url: null, color: '#fff',
  company: null, company_id: null, founded_at: null, disbanded_at: null,
  notes: null, style: null, instagram: null, facebook: null, x: null,
  youtube: null, updated_at: '', created_at: '',
};

describe('getGroupCompleteness', () => {
  it('returns isComplete false when all null', () => {
    expect(getGroupCompleteness(baseGroup).isComplete).toBeFalse();
  });

  it('returns isComplete true when all core fields present', () => {
    const full: Group = { ...baseGroup, photo_url: 'url', founded_at: '2020-01-01', name_jp: '日文名', youtube: 'yt' };
    expect(getGroupCompleteness(full).isComplete).toBeTrue();
  });
});

const baseCompany: Company = {
  id: '1', name: '測試公司', description: null, photo_url: null,
  color: null, instagram: null, facebook: null, x: null, youtube: null,
  website: null, founded_at: null, created_at: '', updated_at: '',
};

describe('getCompanyCompleteness', () => {
  it('returns isComplete false when all null', () => {
    expect(getCompanyCompleteness(baseCompany).isComplete).toBeFalse();
  });

  it('returns isComplete true when all core fields present', () => {
    const full: Company = { ...baseCompany, photo_url: 'url', website: 'https://example.com', instagram: 'ig' };
    expect(getCompanyCompleteness(full).isComplete).toBeTrue();
  });

  it('returns score 100 when all tracked fields present', () => {
    const full: Company = { ...baseCompany, photo_url: 'url', website: 'https://x.com', instagram: 'ig', description: '說明' };
    expect(getCompanyCompleteness(full).score).toBe(100);
  });
});
