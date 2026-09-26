// Shared by the 顏控9選 edge endpoints: calls a public Supabase RPC with the
// anon (publishable) key and caches the JSON per Cloudflare colo, so a traffic
// burst hits the database at most once per TTL per colo instead of once per
// visitor.

// Same public fallbacks as scripts/generate-routes.mjs / environment.ts.
export const DEFAULT_SUPABASE_URL = 'https://ziiagdrrytyrmzoeegjk.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_PtKb4LIJeJN3cECUJllW7w_UFRVTbTv';
const UPSTREAM_TIMEOUT_MS = 8000;

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
  const hit = await cache.match(key);
  if (hit) return hit;

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
    // The client falls back to calling Supabase directly on any non-200.
    return new Response('Upstream unavailable', { status: 502 });
  }
  if (!upstream.ok) return new Response('Upstream error', { status: 502 });

  const response = new Response(await upstream.text(), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Browsers keep it briefly; the edge cache does the heavy lifting.
      'Cache-Control': `public, max-age=30, s-maxage=${ttlSeconds}`,
    },
  });
  ctx.waitUntil(cache.put(key, response.clone()));
  return response;
}
