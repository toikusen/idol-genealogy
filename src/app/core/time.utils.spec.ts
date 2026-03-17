import { formatRelativeTime } from './time.utils';

describe('formatRelativeTime', () => {
  it('returns "剛才" for timestamps less than 1 minute ago', () => {
    const recent = new Date(Date.now() - 30_000).toISOString();
    expect(formatRelativeTime(recent)).toBe('剛才');
  });

  it('returns "N 分鐘前" for timestamps within the past hour', () => {
    const ago = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(formatRelativeTime(ago)).toBe('5 分鐘前');
  });

  it('returns "N 小時前" for timestamps within the past day', () => {
    const ago = new Date(Date.now() - 3 * 3600_000).toISOString();
    expect(formatRelativeTime(ago)).toBe('3 小時前');
  });

  it('returns "N 天前" for older timestamps', () => {
    const ago = new Date(Date.now() - 2 * 86400_000).toISOString();
    expect(formatRelativeTime(ago)).toBe('2 天前');
  });

  it('returns "—" for null input', () => {
    expect(formatRelativeTime(null)).toBe('—');
  });
});
