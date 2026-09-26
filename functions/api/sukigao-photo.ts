import { DEFAULT_SUPABASE_URL, SukigaoEnv } from './_sukigao-supabase';

// Same-origin copy of a member photo, for the 顏控9選 share image. The browser
// can only export a canvas whose images are CORS-readable; if Supabase Storage
// ever serves them without CORS headers, the image generator retries here.
// Only this project's public storage paths are accepted — not an open proxy.
const CACHE_SECONDS = 24 * 60 * 60;
const ALLOWED_PATHS = ['/storage/v1/render/image/public/', '/storage/v1/object/public/'];

export const onRequestGet: PagesFunction<SukigaoEnv> = async ({ request, env, waitUntil }) => {
  const raw = new URL(request.url).searchParams.get('src') ?? '';
  let src: URL;
  try {
    src = new URL(raw);
  } catch {
    return new Response('Bad src', { status: 400 });
  }
  const origin = new URL(env.SUPABASE_URL ?? DEFAULT_SUPABASE_URL).origin;
  if (src.origin !== origin || !ALLOWED_PATHS.some(p => src.pathname.startsWith(p))) {
    return new Response('Forbidden src', { status: 403 });
  }

  const cache = caches.default;
  const key = new Request(src.toString(), { method: 'GET' });
  const hit = await cache.match(key);
  if (hit) return hit;

  let upstream: Response;
  try {
    upstream = await fetch(src.toString(), { signal: AbortSignal.timeout(8000) });
  } catch {
    return new Response('Upstream unavailable', { status: 502 });
  }
  const type = upstream.headers.get('Content-Type') ?? '';
  if (!upstream.ok || !type.startsWith('image/')) return new Response('Upstream error', { status: 502 });

  const response = new Response(upstream.body, {
    headers: {
      'Content-Type': type,
      'Cache-Control': `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}`,
    },
  });
  waitUntil(cache.put(key, response.clone()));
  return response;
};
