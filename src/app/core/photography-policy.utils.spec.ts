import {
  photographyBadgeColor,
  photographyBadgeTextColor,
  photographyBadgeBorderColor,
  photographyStatusLabel,
} from './photography-policy.utils';

describe('photographyBadgeColor', () => {
  it('returns green bg for allowed', () =>
    expect(photographyBadgeColor('allowed')).toBe('rgba(34,197,94,0.12)'));
  it('returns red bg for not_allowed', () =>
    expect(photographyBadgeColor('not_allowed')).toBe('rgba(239,68,68,0.12)'));
  it('returns yellow bg for conditional', () =>
    expect(photographyBadgeColor('conditional')).toBe('rgba(251,191,36,0.12)'));
  it('returns transparent for null', () =>
    expect(photographyBadgeColor(null)).toBe('transparent'));
});

describe('photographyBadgeTextColor', () => {
  it('returns #4ade80 for allowed', () =>
    expect(photographyBadgeTextColor('allowed')).toBe('#4ade80'));
  it('returns #f87171 for not_allowed', () =>
    expect(photographyBadgeTextColor('not_allowed')).toBe('#f87171'));
  it('returns #fbbf24 for conditional', () =>
    expect(photographyBadgeTextColor('conditional')).toBe('#fbbf24'));
  it('returns faint color for null', () =>
    expect(photographyBadgeTextColor(null)).toBe('var(--text-faint-55)'));
});

describe('photographyBadgeBorderColor', () => {
  it('returns green border for allowed', () =>
    expect(photographyBadgeBorderColor('allowed')).toBe('rgba(34,197,94,0.25)'));
  it('returns red border for not_allowed', () =>
    expect(photographyBadgeBorderColor('not_allowed')).toBe('rgba(239,68,68,0.25)'));
  it('returns yellow border for conditional', () =>
    expect(photographyBadgeBorderColor('conditional')).toBe('rgba(251,191,36,0.25)'));
  it('returns transparent for null', () =>
    expect(photographyBadgeBorderColor(null)).toBe('transparent'));
});

describe('photographyStatusLabel', () => {
  it('photo: allowed → 可拍', () =>
    expect(photographyStatusLabel('allowed', 'photo')).toBe('可拍'));
  it('photo: not_allowed → 不可拍', () =>
    expect(photographyStatusLabel('not_allowed', 'photo')).toBe('不可拍'));
  it('photo: conditional → 條件式', () =>
    expect(photographyStatusLabel('conditional', 'photo')).toBe('條件式'));
  it('video: allowed → 可錄', () =>
    expect(photographyStatusLabel('allowed', 'video')).toBe('可錄'));
  it('video: not_allowed → 不可錄', () =>
    expect(photographyStatusLabel('not_allowed', 'video')).toBe('不可錄'));
  it('video: conditional → 條件式', () =>
    expect(photographyStatusLabel('conditional', 'video')).toBe('條件式'));
  it('null → empty string', () =>
    expect(photographyStatusLabel(null, 'photo')).toBe(''));
});
