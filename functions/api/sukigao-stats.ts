import { SukigaoEnv, cachedRpc } from './_sukigao-supabase';

// Play and player counts for the 顏控9選 intro, result page and home entry —
// no per-member numbers (those are 後台 only, migration 116). Every finisher
// asks for it, so it is served from the edge: one aggregate query per colo per
// minute however many people are playing.
const CACHE_SECONDS = 60;

export const onRequestGet: PagesFunction<SukigaoEnv> = ({ request, env, waitUntil }) => {
  const origin = new URL(request.url).origin;
  // A new cache key, so a stale copy of the old per-member payload is never served.
  return cachedRpc({ env, waitUntil }, `${origin}/api/sukigao-stats?v=summary`, 'get_sukigao_summary', {}, CACHE_SECONDS);
};
