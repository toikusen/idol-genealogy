import { extractChannelId, parseChannelUrl } from '../../src/app/core/youtube-feed.utils';

const UPSTREAM_TIMEOUT_MS = 8000;

const PAGE_HEADERS: HeadersInit = {
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
};

/**
 * Resolves a YouTube channel URL or handle to its UC... channel ID.
 *
 * 200 { channelId: string } — resolved
 * 200 { channelId: null }   — page fetched, genuinely not a channel
 * 400                       — not a YouTube channel URL (rejected before fetch)
 * 503                       — YouTube timed out, errored, or redirected
 *
 * The 200-null / 503 split matters: callers null out a stored channel ID on the
 * former but leave it untouched on the latter, so a transient YouTube outage
 * cannot permanently unlink a valid channel.
 */
export const onRequestGet: PagesFunction = async ({ request }) => {
  const target = parseChannelUrl(new URL(request.url).searchParams.get('url'));
  if (!target) return new Response('Not a YouTube channel URL', { status: 400 });

  let page: Response;
  try {
    page = await fetch(target, {
      headers: PAGE_HEADERS,
      // Do not chase redirects: a permitted host could redirect off-site.
      redirect: 'manual',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return new Response('YouTube unreachable', { status: 503 });
  }

  if (!page.ok) return new Response(`YouTube error ${page.status}`, { status: 503 });

  return Response.json({ channelId: extractChannelId(await page.text()) });
};
