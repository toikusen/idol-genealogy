// Pure helpers for the YouTube channel RSS integration.
//
// Kept free of Angular and Workers APIs on purpose: the Pages Functions in
// functions/api/ import this file directly, and the specs run under `ng test`.

const CHANNEL_ID = /^UC[\w-]{22}$/;

const CHANNEL_PATHS = [
  /^\/@[^/]+\/?$/,
  /^\/channel\/UC[\w-]{22}\/?$/,
  /^\/c\/[^/]+\/?$/,
  /^\/user\/[^/]+\/?$/,
];

const ALLOWED_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);

/**
 * Validates that a string is an HTTPS YouTube *channel* URL and returns it
 * normalized, or null if it is anything else.
 *
 * This is the SSRF guard for the channel-id resolver: only its return value may
 * ever reach fetch(). Hostname checks alone are not enough, since a permitted
 * host can still expose redirecting paths — hence the path allowlist.
 *
 * It doubles as the "is this even a channel URL?" test, so video and playlist
 * URLs are rejected before any network call.
 */
export function parseChannelUrl(input: string | null | undefined): string | null {
  if (!input) return null;

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:') return null;
  if (!ALLOWED_HOSTS.has(url.hostname)) return null;
  if (!CHANNEL_PATHS.some(re => re.test(url.pathname))) return null;

  return `https://www.youtube.com${url.pathname}`;
}

// Ordered by verified reliability against real channel pages (2026-07-21).
// The `"channelId":"UC..."` and `"browse_id":"UC..."` shapes are NOT present in
// the served HTML and must never be the only pattern — they trail as fallbacks
// in case YouTube reshuffles its markup again.
const CHANNEL_ID_PATTERNS = [
  /rel="canonical"\s+href="[^"]*\/channel\/(UC[\w-]{22})/,
  /channel_id=(UC[\w-]{22})/,
  /itemprop="identifier"\s+content="(UC[\w-]{22})"/,
  /"browse_id":"(UC[\w-]{22})"/,
  /"channelId":"(UC[\w-]{22})"/,
];

/** Extracts a UC... channel ID from channel-page HTML, or null if absent. */
export function extractChannelId(html: string): string | null {
  for (const pattern of CHANNEL_ID_PATTERNS) {
    const match = pattern.exec(html);
    if (match) return match[1];
  }
  return null;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/** Decodes the XML entities that show up in real video titles. */
export function decodeXmlEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|\w+);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

export interface FeedVideo {
  videoId: string;
  title: string;
  thumbnail: string;
  publishedAt: string;
  views: number;
}

function field(block: string, pattern: RegExp): string | null {
  const match = pattern.exec(block);
  return match ? match[1] : null;
}

/**
 * Parses a YouTube channel RSS feed and returns its videos ranked by view count.
 *
 * The Workers runtime has no DOMParser, so this splits on <entry> and applies
 * per-field regexes. Entries with no view count sort as 0 rather than being
 * dropped — a missing statistic should not hide a video entirely.
 *
 * @param limit how many videos to return, highest view count first
 */
export function parseVideoFeed(xml: string, limit = 3): FeedVideo[] {
  if (!xml) return [];

  const videos: FeedVideo[] = [];

  for (const block of xml.split('<entry>').slice(1)) {
    const videoId = field(block, /<yt:videoId>([\w-]+)<\/yt:videoId>/);
    if (!videoId) continue;

    const rawTitle = field(block, /<title>([\s\S]*?)<\/title>/);
    const views = field(block, /<media:statistics\s+views="(\d+)"/);

    videos.push({
      videoId,
      title: rawTitle ? decodeXmlEntities(rawTitle.trim()) : '',
      thumbnail: field(block, /<media:thumbnail\s+url="([^"]+)"/)
        ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      publishedAt: field(block, /<published>([^<]+)<\/published>/) ?? '',
      views: views ? parseInt(views, 10) : 0,
    });
  }

  return videos.sort((a, b) => b.views - a.views).slice(0, limit);
}

/** True if the value is a well-formed UC... channel ID. */
export function isChannelId(value: string | null | undefined): boolean {
  return !!value && CHANNEL_ID.test(value);
}
