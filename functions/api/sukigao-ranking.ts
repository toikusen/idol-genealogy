import { SukigaoEnv, cachedRpc } from './_sukigao-supabase';

// The ranking is an aggregate over every submission; recomputing it for each
// visitor is what would hurt under load. A minute of staleness is fine.
const CACHE_SECONDS = 60;
const LIMIT = 100;

export const onRequestGet: PagesFunction<SukigaoEnv> = ({ request, env, waitUntil }) => {
  const url = new URL(request.url);
  const mode = url.searchParams.get('mode') === 'first' ? 'first' : 'top9';
  return cachedRpc(
    { env, waitUntil },
    `${url.origin}/api/sukigao-ranking?mode=${mode}`,
    'get_sukigao_ranking',
    { p_mode: mode, p_limit: LIMIT },
    CACHE_SECONDS,
  );
};
