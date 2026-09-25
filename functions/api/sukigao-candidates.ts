import { SukigaoEnv, cachedRpc } from './_sukigao-supabase';

// The pool changes only when members are edited; five minutes of staleness is
// invisible to players and caps DB load during a viral burst.
const CACHE_SECONDS = 5 * 60;

export const onRequestGet: PagesFunction<SukigaoEnv> = ({ request, env, waitUntil }) => {
  const origin = new URL(request.url).origin;
  return cachedRpc({ env, waitUntil }, `${origin}/api/sukigao-candidates`, 'get_sukigao_candidates', {}, CACHE_SECONDS);
};
