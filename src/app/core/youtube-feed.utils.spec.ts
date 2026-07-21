import {
  decodeXmlEntities,
  extractChannelId,
  isChannelId,
  parseChannelUrl,
  parseVideoFeed,
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

describe('parseVideoFeed', () => {
  const entry = (id: string, title: string, views: string | null) => `
    <entry>
      <yt:videoId>${id}</yt:videoId>
      <title>${title}</title>
      <published>2026-07-20T14:28:00+00:00</published>
      <media:group>
        <media:thumbnail url="https://i2.ytimg.com/vi/${id}/hqdefault.jpg" width="480" height="360"/>
        ${views === null ? '' : `<media:community><media:statistics views="${views}"/></media:community>`}
      </media:group>
    </entry>`;

  const feed = (...entries: string[]) => `<?xml version="1.0"?><feed>${entries.join('')}</feed>`;

  it('ranks by view count descending and applies the limit', () => {
    const xml = feed(
      entry('aaaaaaaaaaa', 'low', '10'),
      entry('bbbbbbbbbbb', 'high', '9000'),
      entry('ccccccccccc', 'mid', '500'),
      entry('ddddddddddd', 'lowest', '1'),
    );

    expect(parseVideoFeed(xml).map(v => v.title)).toEqual(['high', 'mid', 'low']);
    expect(parseVideoFeed(xml, 1).map(v => v.title)).toEqual(['high']);
  });

  it('keeps entries with no view count, sorted as zero', () => {
    const result = parseVideoFeed(feed(
      entry('aaaaaaaaaaa', 'no stats', null),
      entry('bbbbbbbbbbb', 'has stats', '5'),
    ));

    expect(result.map(v => v.title)).toEqual(['has stats', 'no stats']);
    expect(result[1].views).toBe(0);
  });

  it('decodes entities in titles', () => {
    const [video] = parseVideoFeed(feed(entry('aaaaaaaaaaa', 'Tulsi &amp; Akhil&#39;s Mix', '1')));
    expect(video.title).toBe("Tulsi & Akhil's Mix");
  });

  it('extracts the fields the frontend renders', () => {
    const [video] = parseVideoFeed(feed(entry('Mdetf76SdMw', 'Song', '10517')));
    expect(video).toEqual({
      videoId: 'Mdetf76SdMw',
      title: 'Song',
      thumbnail: 'https://i2.ytimg.com/vi/Mdetf76SdMw/hqdefault.jpg',
      publishedAt: '2026-07-20T14:28:00+00:00',
      views: 10517,
    });
  });

  it('falls back to a derived thumbnail when the feed omits one', () => {
    const xml = feed('<entry><yt:videoId>Mdetf76SdMw</yt:videoId><title>t</title></entry>');
    expect(parseVideoFeed(xml)[0].thumbnail)
      .toBe('https://i.ytimg.com/vi/Mdetf76SdMw/hqdefault.jpg');
  });

  it('returns an empty array for empty, malformed, and entry-less feeds', () => {
    expect(parseVideoFeed('')).toEqual([]);
    expect(parseVideoFeed('<html>not a feed at all</html>')).toEqual([]);
    expect(parseVideoFeed(feed('<entry><title>no video id</title></entry>'))).toEqual([]);
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
