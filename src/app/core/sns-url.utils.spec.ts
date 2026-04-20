import { normalizeSnsUrl } from './sns-url.utils';

describe('normalizeSnsUrl', () => {
  it('returns null for empty / whitespace / nullish values', () => {
    expect(normalizeSnsUrl(null, 'instagram')).toBeNull();
    expect(normalizeSnsUrl(undefined, 'instagram')).toBeNull();
    expect(normalizeSnsUrl('', 'instagram')).toBeNull();
    expect(normalizeSnsUrl('   ', 'instagram')).toBeNull();
  });

  it('passes through https:// and http:// URLs unchanged (trimmed)', () => {
    expect(normalizeSnsUrl('https://instagram.com/alice', 'instagram'))
      .toBe('https://instagram.com/alice');
    expect(normalizeSnsUrl('http://facebook.com/bob', 'facebook'))
      .toBe('http://facebook.com/bob');
    expect(normalizeSnsUrl('  https://x.com/carol  ', 'x'))
      .toBe('https://x.com/carol');
  });

  it('preserves www. and trailing slash in pass-through URLs', () => {
    expect(normalizeSnsUrl('https://www.instagram.com/alice/', 'instagram'))
      .toBe('https://www.instagram.com/alice/');
  });

  it('does not double-prefix a full URL when platform would have prepended one', () => {
    expect(normalizeSnsUrl('https://instagram.com/alice', 'instagram'))
      .not.toContain('https://instagram.com/https://');
  });

  it('prepends platform base for bare usernames', () => {
    expect(normalizeSnsUrl('alice', 'instagram')).toBe('https://instagram.com/alice');
    expect(normalizeSnsUrl('bob', 'facebook')).toBe('https://facebook.com/bob');
    expect(normalizeSnsUrl('carol', 'x')).toBe('https://x.com/carol');
    expect(normalizeSnsUrl('dave', 'youtube')).toBe('https://youtube.com/dave');
  });

  it('strips leading @ from bare handles', () => {
    expect(normalizeSnsUrl('@alice', 'x')).toBe('https://x.com/alice');
    expect(normalizeSnsUrl(' @bob ', 'instagram')).toBe('https://instagram.com/bob');
  });

  it('strips leading slashes from bare handles', () => {
    expect(normalizeSnsUrl('/alice', 'instagram')).toBe('https://instagram.com/alice');
    expect(normalizeSnsUrl('///alice', 'instagram')).toBe('https://instagram.com/alice');
  });

  it('returns null if only prefix characters remain after stripping', () => {
    expect(normalizeSnsUrl('@', 'x')).toBeNull();
    expect(normalizeSnsUrl('/', 'instagram')).toBeNull();
  });
});
