// Shared by the 顏控9選 edge endpoints: calls a public Supabase RPC with the
// anon (publishable) key and caches the JSON per Cloudflare colo, so a traffic
// burst hits the database at most once per TTL per colo instead of once per
// visitor.

// Same public fallbacks as scripts/generate-routes.mjs / environment.ts.
export const DEFAULT_SUPABASE_URL = 'https://ziiagdrrytyrmzoeegjk.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_PtKb4LIJeJN3cECUJllW7w_UFRVTbTv';
const UPSTREAM_TIMEOUT_MS = 8000;
const STALE_SECONDS = 24 * 60 * 60;

export interface SukigaoEnv {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
}

/**
 * `cacheKey` must be canonical (built from validated params only): anything a
 * caller can vary freely would let them skip the cache and reach the database.
 */
export async function cachedRpc(
  ctx: { env: SukigaoEnv; waitUntil: (p: Promise<unknown>) => void },
  cacheKey: string,
  fn: string,
  args: Record<string, unknown>,
  ttlSeconds: number,
): Promise<Response> {
  const cache = caches.default;
  const key = new Request(cacheKey, { method: 'GET' });
  // Long-lived copy of the last good answer, served when Supabase is slow or
  // down — otherwise every visitor would fall back to calling the database
  // directly at exactly the moment it is struggling.
  const staleKey = new Request(`${cacheKey}${cacheKey.includes('?') ? '&' : '?'}__stale=1`, { method: 'GET' });
  const hit = await cache.match(key);
  if (hit) return hit;
  const serveStale = async (fallback: Response): Promise<Response> => (await cache.match(staleKey)) ?? fallback;

  const base = ctx.env.SUPABASE_URL ?? DEFAULT_SUPABASE_URL;
  const apiKey = ctx.env.SUPABASE_ANON_KEY ?? DEFAULT_SUPABASE_KEY;
  let upstream: Response;
  try {
    upstream = await fetch(`${base}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    // No stale copy either: the client falls back to Supabase directly.
    return serveStale(new Response('Upstream unavailable', { status: 502 }));
  }
  if (!upstream.ok) return serveStale(new Response('Upstream error', { status: 502 }));

  const body = await upstream.text();
  const response = new Response(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Browsers keep it briefly; the edge cache does the heavy lifting.
      'Cache-Control': `public, max-age=30, s-maxage=${ttlSeconds}`,
    },
  });
  const stale = new Response(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=30, s-maxage=${STALE_SECONDS}`,
    },
  });
  ctx.waitUntil(Promise.all([cache.put(key, response.clone()), cache.put(staleKey, stale)]));
  return response;
}
