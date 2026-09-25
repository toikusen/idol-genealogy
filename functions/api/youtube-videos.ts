import { isChannelId, parseVideoList, uploadsPlaylistId } from '../../src/app/core/youtube-feed.utils';

// Ranking is by view count, not recency: a new upload starts at 0 views and takes
// days to crack the top 3, so the displayed set moves slowly no matter how often
// this refreshes. The real bound on the TTL is dead links — a deleted or
// privatised video stays cached this long — which is what keeps it at a day.
const CACHE_SECONDS = 24 * 60 * 60;
const FAILURE_CACHE_SECONDS = 5 * 60;
const UPSTREAM_TIMEOUT_MS = 8000;
const VIDEO_COUNT = 3;
// How many recent uploads to rank across — the API caps both playlistItems and
// videos.list at 50, so this is the widest a 2-unit refresh can be. It needs to
// be wide: on a company channel shared by several groups, this group's videos
// may be sparse among its siblings' after title filtering.
const CANDIDATE_COUNT = 50;

const API = 'https://www.googleapis.com/youtube/v3';

interface Env {
  YOUTUBE_API_KEY?: string;
}

/**
 * Top videos from a channel, ranked by view count.
 *
 * Uses the YouTube Data API rather than the public RSS feed: the feed is blocked
 * from Cloudflare's egress IPs (verified in production 2026-07-21 — every channel
 * returned empty from the deployed Function while the same feeds returned 200
 * from a residential IP). Two calls, 1 quota unit each, against a 10k/day tier.
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const params = new URL(request.url).searchParams;
  const channel = params.get('channel');
  // Group names, for channels shared by several groups. The cache key carries
  // them, so two groups on one channel cache separately — which is correct.
  const names = params.getAll('match');

  // Doubles as the SSRF guard: the channel ID is interpolated into fixed
  // googleapis URLs below, so nothing caller-supplied reaches fetch() verbatim.
  if (!isChannelId(channel)) return new Response('Invalid channel', { status: 400 });

  const cache = caches.default;
  const cacheKey = new Request(request.url, { method: 'GET' });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  // Empty body, cached briefly: the frontend treats [] and a failure the same
  // way (no video section), and this stops a quota-exhausted or degraded window
  // from having every visitor re-hit the API.
  const backOff = () => {
    const response = Response.json([], {
      headers: { 'Cache-Control': `s-maxage=${FAILURE_CACHE_SECONDS}` },
    });
    waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  };

  const key = env.YOUTUBE_API_KEY;
  if (!key) return backOff();

  const getJson = async (url: string): Promise<unknown | null> => {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  };

  // 1. Recent uploads. The uploads playlist is derived from the channel ID, which
  //    saves a channels.list call.
  const playlist = await getJson(
    `${API}/playlistItems?part=contentDetails&maxResults=${CANDIDATE_COUNT}`
    + `&playlistId=${uploadsPlaylistId(channel!)}&key=${key}`,
  ) as { items?: { contentDetails?: { videoId?: string } }[] } | null;

  const videoIds = (playlist?.items ?? [])
    .map(item => item?.contentDetails?.videoId)
    .filter((id): id is string => typeof id === 'string');

  if (!videoIds.length) return backOff();

  // 2. Statistics for those uploads — playlistItems does not carry view counts.
  const details = await getJson(
    `${API}/videos?part=snippet,statistics&id=${videoIds.join(',')}&key=${key}`,
  );
  if (!details) return backOff();

  const videos = parseVideoList(details, VIDEO_COUNT, names);
  if (!videos.length) return backOff();

  const response = Response.json(videos, {
    headers: { 'Cache-Control': `s-maxage=${CACHE_SECONDS}` },
  });

  // Cache API is per-colo but shared across isolates, unlike the in-memory Map
  // in timetree-events.ts — at this traffic level a per-isolate cache would
  // mostly miss and spend quota anyway.
  waitUntil(cache.put(cacheKey, response.clone()));
  return response;
};
