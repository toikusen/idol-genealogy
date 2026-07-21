import { isChannelId, parseVideoFeed } from '../../src/app/core/youtube-feed.utils';

// Ranking is by view count, not recency: a new upload starts at 0 views and takes
// days to crack the top 3, so the displayed set moves slowly no matter how often
// this refreshes. The real bound on the TTL is dead links — a deleted or
// privatised video stays cached this long — which is what keeps it at a day.
const CACHE_SECONDS = 24 * 60 * 60;
// YouTube rate-limits this feed per IP: verified 2026-07-21, ~20 requests from
// one address turned every later call into a persistent 404/500. Cloudflare
// egresses from shared datacenter IPs, so without negative caching a throttled
// window would have every visitor re-hitting YouTube and extending it.
const FAILURE_CACHE_SECONDS = 5 * 60;
const UPSTREAM_TIMEOUT_MS = 8000;
const VIDEO_COUNT = 3;

// The feed returned 200 in testing with no User-Agent at all (2026-07-21), so
// these are insurance against upstream heuristics changing, not a requirement.
const FEED_HEADERS: HeadersInit = {
  Accept: 'application/atom+xml, application/xml, text/xml',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
};

export const onRequestGet: PagesFunction = async ({ request, waitUntil }) => {
  const channel = new URL(request.url).searchParams.get('channel');

  // Doubles as the SSRF guard: the channel ID is interpolated into a fixed
  // YouTube URL below, so nothing caller-supplied reaches fetch() verbatim.
  if (!isChannelId(channel)) return new Response('Invalid channel', { status: 400 });

  const cache = caches.default;
  const cacheKey = new Request(request.url, { method: 'GET' });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  // Empty body, cached briefly: the frontend treats [] and a failure the same
  // way (no video section), and this keeps a throttled window from compounding.
  const backOff = () => {
    const response = Response.json([], {
      headers: { 'Cache-Control': `s-maxage=${FAILURE_CACHE_SECONDS}` },
    });
    waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  };

  let upstream: Response;
  try {
    upstream = await fetch(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${channel}`,
      { headers: FEED_HEADERS, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) },
    );
  } catch {
    return backOff();
  }

  if (!upstream.ok) return backOff();

  const videos = parseVideoFeed(await upstream.text(), VIDEO_COUNT);
  const response = Response.json(videos, {
    headers: { 'Cache-Control': `s-maxage=${CACHE_SECONDS}` },
  });

  // Cache API is per-colo but shared across isolates, unlike the in-memory Map
  // in timetree-events.ts — at this traffic level a per-isolate cache would
  // mostly miss and hit YouTube anyway.
  waitUntil(cache.put(cacheKey, response.clone()));
  return response;
};
