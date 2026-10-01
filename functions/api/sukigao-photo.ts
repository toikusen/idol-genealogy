import { DEFAULT_SUPABASE_URL, SukigaoEnv } from './_sukigao-supabase';

// Same-origin copy of a member photo, for the 顏控9選 share image. The browser
// can only export a canvas whose images are CORS-readable; if Supabase Storage
// ever serves them without CORS headers, the image generator retries here.
// Only this project's member-photos bucket is accepted — not an open proxy —
// and only raster images are passed through: the bucket takes uploads from any
// signed-in user, and an SVG served from idolmaps.com could run script here.
const CACHE_SECONDS = 24 * 60 * 60;
const BUCKET_PATHS = ['/storage/v1/render/image/public/member-photos/', '/storage/v1/object/public/member-photos/'];
const RASTER_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);

/**
 * The upstream URL rebuilt from the parts we allow — the path plus the
 * supabaseImg transform params — so `?anything=else` can't bust the cache or
 * reach other buckets. Null when `raw` isn't a member photo.
 */
export function canonicalPhotoUrl(raw: string, supabaseUrl: string): string | null {
  let src: URL;
  try {
    src = new URL(raw);
  } catch {
    return null;
  }
  const origin = new URL(supabaseUrl).origin;
  if (src.origin !== origin || !BUCKET_PATHS.some(p => src.pathname.startsWith(p))) return null;
  if (src.pathname.includes('..') || src.pathname.includes('%2e') || src.pathname.includes('%2E')) return null;

  const out = new URL(src.pathname, origin);
  if (src.pathname.startsWith(BUCKET_PATHS[0])) {
    const width = Number(src.searchParams.get('width'));
    const quality = Number(src.searchParams.get('quality'));
    if (Number.isInteger(width) && width >= 16 && width <= 1080) out.searchParams.set('width', String(width));
    if (Number.isInteger(quality) && quality >= 20 && quality <= 100) out.searchParams.set('quality', String(quality));
    if (src.searchParams.get('resize') === 'contain') out.searchParams.set('resize', 'contain');
  }
  return out.toString();
}

export const onRequestGet: PagesFunction<SukigaoEnv> = async ({ request, env, waitUntil }) => {
  const raw = new URL(request.url).searchParams.get('src') ?? '';
  const src = canonicalPhotoUrl(raw, env.SUPABASE_URL ?? DEFAULT_SUPABASE_URL);
  if (!src) return new Response('Forbidden src', { status: 403 });

  const cache = caches.default;
  const key = new Request(src, { method: 'GET' });
  const hit = await cache.match(key);
  if (hit) return hit;

  let upstream: Response;
  try {
    upstream = await fetch(src, { signal: AbortSignal.timeout(8000) });
  } catch {
    return new Response('Upstream unavailable', { status: 502 });
  }
  const type = (upstream.headers.get('Content-Type') ?? '').split(';')[0].trim().toLowerCase();
  if (!upstream.ok || !RASTER_TYPES.has(type)) return new Response('Upstream error', { status: 502 });

  const response = new Response(upstream.body, {
    headers: {
      'Content-Type': type,
      'Cache-Control': `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
  waitUntil(cache.put(key, response.clone()));
  return response;
};
