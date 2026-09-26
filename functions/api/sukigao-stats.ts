import { SukigaoEnv, cachedRpc } from './_sukigao-supabase';

// Play count + per-member pick counts for the 顏控9選 result page. Every
// finisher asks for it, so it is served from the edge: one aggregate query per
// colo per minute however many people are playing.
const CACHE_SECONDS = 60;

export const onRequestGet: PagesFunction<SukigaoEnv> = ({ request, env, waitUntil }) => {
  const origin = new URL(request.url).origin;
  return cachedRpc({ env, waitUntil }, `${origin}/api/sukigao-stats`, 'get_sukigao_stats', {}, CACHE_SECONDS);
};
