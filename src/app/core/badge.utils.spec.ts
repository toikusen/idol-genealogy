import { getBadge, getNextBadge, BADGES, TABLE_LABELS } from './badge.utils';

describe('getBadge', () => {
  it('returns null for 0 approved', () => expect(getBadge(0)).toBeNull());
  it('returns 新芽 for 1 approved', () => expect(getBadge(1)?.name).toBe('新芽'));
  it('returns 新芽 for 9 approved', () => expect(getBadge(9)?.name).toBe('新芽'));
  it('returns 初心者 for 10 approved', () => expect(getBadge(10)?.name).toBe('初心者'));
  it('returns 貢獻者 for 30 approved', () => expect(getBadge(30)?.name).toBe('貢獻者'));
  it('returns 資深貢獻者 for 100 approved', () => expect(getBadge(100)?.name).toBe('資深貢獻者'));
  it('returns 傳說級 for 300 approved', () => expect(getBadge(300)?.name).toBe('傳說級'));
  it('returns 傳說級 for 999 approved (max clamps)', () => expect(getBadge(999)?.name).toBe('傳說級'));
});

describe('getNextBadge', () => {
  it('returns 新芽 as next for 0 approved, remaining 1', () => {
    const r = getNextBadge(0);
    expect(r?.badge.name).toBe('新芽');
    expect(r?.remaining).toBe(1);
  });
  it('returns 初心者 as next for 5 approved, remaining 5', () => {
    const r = getNextBadge(5);
    expect(r?.badge.name).toBe('初心者');
    expect(r?.remaining).toBe(5);
  });
  it('returns 初心者 as next for 1 approved (新芽 already earned, next target is 初心者)', () => {
    const r = getNextBadge(1);
    expect(r?.badge.name).toBe('初心者');
    expect(r?.remaining).toBe(9);
  });
  it('returns null at exactly 300 (max tier reached)', () => expect(getNextBadge(300)).toBeNull());
  it('returns null at 500', () => expect(getNextBadge(500)).toBeNull());
});

describe('TABLE_LABELS', () => {
  it('maps all four table names', () => {
    expect(TABLE_LABELS['members']).toBe('成員');
    expect(TABLE_LABELS['groups']).toBe('組合');
    expect(TABLE_LABELS['companies']).toBe('公司');
    expect(TABLE_LABELS['history']).toBe('歷程');
  });
});

describe('BADGES', () => {
  it('has 5 tiers in ascending threshold order', () => {
    expect(BADGES.length).toBe(5);
    for (let i = 1; i < BADGES.length; i++) {
      expect(BADGES[i].threshold).toBeGreaterThan(BADGES[i - 1].threshold);
    }
  });
});
