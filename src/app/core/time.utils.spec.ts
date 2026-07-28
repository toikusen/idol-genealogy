import { formatRelativeTime, formatYmd } from './time.utils';

describe('formatYmd', () => {
  it('renders a full date without a leading zero', () => {
    expect(formatYmd('2015-04-01')).toBe('2015年4月1日');
  });

  it('does not shift the day across timezones', () => {
    expect(formatYmd('2015-01-01')).toBe('2015年1月1日');
    expect(formatYmd('2015-12-31')).toBe('2015年12月31日');
  });

  it('keeps a timestamp to its date part', () => {
    expect(formatYmd('2015-04-01T00:00:00Z')).toBe('2015年4月1日');
  });

  it('renders only the precision the value carries', () => {
    expect(formatYmd('2015-04')).toBe('2015年4月');
    expect(formatYmd('2015')).toBe('2015年');
  });

  it('returns an empty string for null', () => {
    expect(formatYmd(null)).toBe('');
  });
});

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
