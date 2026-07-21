import {
  decodeXmlEntities,
  extractChannelId,
  isChannelId,
  parseChannelUrl,
  parseVideoList,
  uploadsPlaylistId,
} from './youtube-feed.utils';

describe('parseChannelUrl', () => {
  it('accepts the channel URL forms', () => {
    expect(parseChannelUrl('https://www.youtube.com/@RickAstleyYT'))
      .toBe('https://www.youtube.com/@RickAstleyYT');
    expect(parseChannelUrl('https://www.youtube.com/channel/UCuAXFkgsw1L7xaCfnd5JJOw'))
      .toBe('https://www.youtube.com/channel/UCuAXFkgsw1L7xaCfnd5JJOw');
    expect(parseChannelUrl('https://youtube.com/c/SomeName'))
      .toBe('https://www.youtube.com/c/SomeName');
    expect(parseChannelUrl('https://m.youtube.com/user/SomeUser'))
      .toBe('https://www.youtube.com/user/SomeUser');
  });

  it('rejects non-HTTPS', () => {
    expect(parseChannelUrl('http://www.youtube.com/@RickAstleyYT')).toBeNull();
  });

  it('rejects lookalike hostnames', () => {
    expect(parseChannelUrl('https://youtube.com.evil.test/@foo')).toBeNull();
    expect(parseChannelUrl('https://evil.test/@foo')).toBeNull();
    expect(parseChannelUrl('https://notyoutube.com/@foo')).toBeNull();
  });

  it('rejects non-channel paths on an allowed host', () => {
    expect(parseChannelUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(parseChannelUrl('https://www.youtube.com/playlist?list=PL123')).toBeNull();
    expect(parseChannelUrl('https://www.youtube.com/shorts/abc123')).toBeNull();
    expect(parseChannelUrl('https://www.youtube.com/redirect?q=https://evil.test')).toBeNull();
    expect(parseChannelUrl('https://www.youtube.com/')).toBeNull();
  });

  it('rejects unparseable and empty input', () => {
    expect(parseChannelUrl('not a url')).toBeNull();
    expect(parseChannelUrl('')).toBeNull();
    expect(parseChannelUrl(null)).toBeNull();
    expect(parseChannelUrl(undefined)).toBeNull();
  });
});

describe('extractChannelId', () => {
  const ID = 'UCuAXFkgsw1L7xaCfnd5JJOw';

  // One test per pattern in isolation: the failure this guards against is a
  // single pattern silently disappearing from YouTube's markup, which a test
  // against one whole saved page would not catch.
  it('reads the canonical link', () => {
    expect(extractChannelId(`<link rel="canonical" href="https://www.youtube.com/channel/${ID}">`))
      .toBe(ID);
  });

  it('reads the RSS alternate link', () => {
    expect(extractChannelId(`<link rel="alternate" href="...?channel_id=${ID}">`)).toBe(ID);
  });

  it('reads the itemprop identifier', () => {
    expect(extractChannelId(`<meta itemprop="identifier" content="${ID}">`)).toBe(ID);
  });

  it('reads the browse_id and channelId fallbacks', () => {
    expect(extractChannelId(`{"browse_id":"${ID}"}`)).toBe(ID);
    expect(extractChannelId(`{"channelId":"${ID}"}`)).toBe(ID);
  });

  it('returns null when no pattern is present', () => {
    expect(extractChannelId('<html><body>nothing here</body></html>')).toBeNull();
    expect(extractChannelId('')).toBeNull();
  });
});

describe('decodeXmlEntities', () => {
  it('decodes named and numeric entities', () => {
    expect(decodeXmlEntities('Rock &amp; Roll')).toBe('Rock & Roll');
    expect(decodeXmlEntities('It&#39;s fine')).toBe("It's fine");
    expect(decodeXmlEntities('&lt;tag&gt; &quot;x&quot;')).toBe('<tag> "x"');
    expect(decodeXmlEntities('&#x263A;')).toBe('☺');
  });

  it('leaves unknown entities alone', () => {
    expect(decodeXmlEntities('100&nope; &amp; more')).toBe('100&nope; & more');
  });
});

describe('uploadsPlaylistId', () => {
  it('swaps the UC prefix for UU', () => {
    expect(uploadsPlaylistId('UCuAXFkgsw1L7xaCfnd5JJOw')).toBe('UUuAXFkgsw1L7xaCfnd5JJOw');
  });
});

describe('parseVideoList', () => {
  const video = (id: string, title: string, views: string | null) => ({
    id,
    snippet: {
      title,
      publishedAt: '2026-07-20T14:28:00Z',
      thumbnails: {
        default: { url: `https://i.ytimg.com/vi/${id}/default.jpg` },
        medium: { url: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` },
        high: { url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` },
      },
    },
    ...(views === null ? {} : { statistics: { viewCount: views } }),
  });

  it('ranks by view count descending and applies the limit', () => {
    const body = { items: [
      video('aaaaaaaaaaa', 'low', '10'),
      video('bbbbbbbbbbb', 'high', '9000'),
      video('ccccccccccc', 'mid', '500'),
      video('ddddddddddd', 'lowest', '1'),
    ] };

    expect(parseVideoList(body).map(v => v.title)).toEqual(['high', 'mid', 'low']);
    expect(parseVideoList(body, 1).map(v => v.title)).toEqual(['high']);
  });

  it('keeps videos with no statistics, sorted as zero', () => {
    const result = parseVideoList({ items: [
      video('aaaaaaaaaaa', 'no stats', null),
      video('bbbbbbbbbbb', 'has stats', '5'),
    ] });

    expect(result.map(v => v.title)).toEqual(['has stats', 'no stats']);
    expect(result[1].views).toBe(0);
  });

  // The API returns titles HTML-escaped even though the payload is JSON.
  it('decodes entities in titles', () => {
    const [v] = parseVideoList({ items: [video('a', 'Tulsi &amp; Akhil&#39;s Mix', '1')] });
    expect(v.title).toBe("Tulsi & Akhil's Mix");
  });

  it('extracts the fields the frontend renders, preferring the high thumbnail', () => {
    const [v] = parseVideoList({ items: [video('Mdetf76SdMw', 'Song', '10517')] });
    expect(v).toEqual({
      videoId: 'Mdetf76SdMw',
      title: 'Song',
      thumbnail: 'https://i.ytimg.com/vi/Mdetf76SdMw/hqdefault.jpg',
      publishedAt: '2026-07-20T14:28:00Z',
      views: 10517,
    });
  });

  it('falls back through thumbnail sizes, then to a derived URL', () => {
    const noHigh = { items: [{ id: 'x', snippet: { thumbnails: { medium: { url: 'M' } } } }] };
    expect(parseVideoList(noHigh)[0].thumbnail).toBe('M');

    const none = { items: [{ id: 'Mdetf76SdMw', snippet: {} }] };
    expect(parseVideoList(none)[0].thumbnail)
      .toBe('https://i.ytimg.com/vi/Mdetf76SdMw/hqdefault.jpg');
  });

  it('skips items with no id', () => {
    expect(parseVideoList({ items: [{ snippet: { title: 'orphan' } }] })).toEqual([]);
  });

  it('returns an empty array for empty, malformed, and missing payloads', () => {
    expect(parseVideoList({ items: [] })).toEqual([]);
    expect(parseVideoList({})).toEqual([]);
    expect(parseVideoList(null)).toEqual([]);
    expect(parseVideoList('not json at all')).toEqual([]);
  });
});

describe('isChannelId', () => {
  it('accepts well-formed IDs and rejects everything else', () => {
    expect(isChannelId('UCuAXFkgsw1L7xaCfnd5JJOw')).toBe(true);
    expect(isChannelId('UCtooshort')).toBe(false);
    expect(isChannelId('XXuAXFkgsw1L7xaCfnd5JJOw')).toBe(false);
    expect(isChannelId('')).toBe(false);
    expect(isChannelId(null)).toBe(false);
  });
});
