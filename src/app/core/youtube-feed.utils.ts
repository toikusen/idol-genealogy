// Pure helpers for the YouTube channel RSS integration.
//
// Kept free of Angular and Workers APIs on purpose: the Pages Functions in
// functions/api/ import this file directly, and the specs run under `ng test`.

const CHANNEL_ID = /^UC[\w-]{22}$/;

// Channel URLs are routinely copied from a tab rather than the channel root —
// "/@handle/videos" is what the browser address bar shows once you click through.
// Capture the channel part and drop the tab, so the fetch hits the channel page.
const CHANNEL_TAB = '(?:/(?:videos|featured|shorts|streams|playlists|community|about|releases|podcasts))?/?';
const CHANNEL_PATHS = [
  new RegExp(`^(/@[^/]+)${CHANNEL_TAB}$`),
  new RegExp(`^(/channel/UC[\\w-]{22})${CHANNEL_TAB}$`),
  new RegExp(`^(/c/[^/]+)${CHANNEL_TAB}$`),
  new RegExp(`^(/user/[^/]+)${CHANNEL_TAB}$`),
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

  for (const pattern of CHANNEL_PATHS) {
    const match = pattern.exec(url.pathname);
    // Rebuilt from the captured channel path only: any tab suffix, query string
    // (?si= tracking params are common) and fragment are dropped here.
    if (match) return `https://www.youtube.com${match[1]}`;
  }
  return null;
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

/**
 * The channel's "uploads" playlist ID.
 *
 * YouTube derives it from the channel ID by swapping the UC prefix for UU, which
 * saves a channels.list call (and a quota unit) per refresh.
 */
export function uploadsPlaylistId(channelId: string): string {
  return `UU${channelId.slice(2)}`;
}

/** Shape of the videos.list response fields this reads. */
interface ApiVideo {
  id?: string;
  snippet?: {
    title?: string;
    publishedAt?: string;
    thumbnails?: Record<string, { url?: string } | undefined>;
  };
  statistics?: { viewCount?: string };
}

// Widest first: high is 480x360, matching what the RSS feed used to return.
const THUMBNAIL_SIZES = ['high', 'medium', 'default'];

function pickThumbnail(video: ApiVideo, videoId: string): string {
  const thumbnails = video.snippet?.thumbnails;
  for (const size of THUMBNAIL_SIZES) {
    const url = thumbnails?.[size]?.url;
    if (url) return url;
  }
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

// Decorative characters that idol group names collect (月宵◇クレシェンテ,
// En9⭐︎熾, ♡xDoLL) and that a video title may or may not reproduce exactly.
// Stripping them from both sides gives a second chance at a match.
const DECORATION = /[\s◇◆★☆♡♥△▲▽▼※・･‐‑‒–—―~〜=＝!！?？.。,、'"“”'']/g;

function bareForm(text: string): string {
  return text.toLowerCase().replace(DECORATION, '');
}

/**
 * Keeps only videos whose title mentions one of `names`.
 *
 * Company channels host several groups, so "top 3 by views" would otherwise mix
 * a sibling group's videos into a group's page. Titles on those channels lead
 * with the group name, which is the only signal available.
 *
 * Returns the input untouched when nothing matches. That fallback is what makes
 * this safe to run unconditionally: a group's own channel rarely repeats the
 * group name in its titles, and filtering those down to nothing would hide
 * videos that were fine.
 */
export function filterByName(videos: FeedVideo[], names: string[]): FeedVideo[] {
  const terms = names.map(n => n.trim()).filter(Boolean);
  if (!terms.length) return videos;

  const bareTerms = terms.map(bareForm).filter(Boolean);

  const matched = videos.filter(video => {
    const title = video.title.toLowerCase();
    if (terms.some(term => title.includes(term.toLowerCase()))) return true;

    // Second pass without decoration, so a title writing 月宵クレシェンテ still
    // matches the stored 月宵◇クレシェンテ.
    const bareTitle = bareForm(video.title);
    return bareTerms.some(term => bareTitle.includes(term));
  });

  return matched.length ? matched : videos;
}

/**
 * Maps a YouTube Data API videos.list response to videos ranked by view count.
 *
 * Titles still need entity decoding — the API returns them HTML-escaped, so
 * "Rock & Roll" arrives as "Rock &amp; Roll" despite being JSON.
 *
 * Videos with no viewCount sort as 0 rather than being dropped; a missing
 * statistic should not hide a video entirely.
 *
 * @param limit how many videos to return, highest view count first
 * @param names group names to match against titles; filtering happens before
 *   the limit is applied, and falls back to the full set when nothing matches
 */
export function parseVideoList(body: unknown, limit = 3, names: string[] = []): FeedVideo[] {
  const items = (body as { items?: ApiVideo[] } | null)?.items;
  if (!Array.isArray(items)) return [];

  const videos: FeedVideo[] = [];

  for (const item of items) {
    const videoId = item?.id;
    if (!videoId) continue;

    const views = item.statistics?.viewCount;

    videos.push({
      videoId,
      title: decodeXmlEntities((item.snippet?.title ?? '').trim()),
      thumbnail: pickThumbnail(item, videoId),
      publishedAt: item.snippet?.publishedAt ?? '',
      views: views ? parseInt(views, 10) : 0,
    });
  }

  return filterByName(videos, names)
    .sort((a, b) => b.views - a.views)
    .slice(0, limit);
}

/** True if the value is a well-formed UC... channel ID. */
export function isChannelId(value: string | null | undefined): boolean {
  return !!value && CHANNEL_ID.test(value);
}
