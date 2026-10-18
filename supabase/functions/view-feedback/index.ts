// Anonymous feedback from the 別擋我推 page (/view). Deploy with --no-verify-jwt.
//
// Rows go to `view_feedback`, readable only by admins. Guards, cheapest first:
// honeypot + fill-time trap and content rules here, then submit_view_feedback
// (migration 119) checks 3 per address per 10 minutes and 10 per day, no repeat
// of the same text within 7 days and 300 a day overall, atomically with the insert.
// ponytail: no Turnstile — TURNSTILE_SECRET is project-wide and /view sends no token,
// so sharing it with venue-plan-upload would reject every report; add a separate
// secret + widget if bots get past the traps.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkFeedback, ipKey, normalizeMessage, RawFeedback } from './check.ts';

const ORIGINS = [/^https:\/\/idolmaps\.com$/, /^https:\/\/[a-z0-9-]+\.idol-genealogy\.pages\.dev$/, /^http:\/\/localhost:\d+$/];
const REFUSED: Record<string, [number, string]> = {
  burst: [429, '送出太頻繁了，請過幾分鐘再試'],
  daily: [429, '今天的回報次數已達上限，明天再試'],
  dup: [409, '已經收到相同的內容了，謝謝你！'],
  cap: [503, '今天收到的回報太多了，請明天再試'],
};

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('');
const sha256 = async (s: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));

Deno.serve(async req => {
  const origin = req.headers.get('origin') ?? '';
  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': ORIGINS.some(o => o.test(origin)) ? origin : 'https://idolmaps.com',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
  const reply = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
  const fail = (status: number, error: string) => reply(status, { error });

  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return fail(405, 'POST only');
  if (Number(req.headers.get('content-length') ?? 0) > 8192) return fail(413, '內容太長');

  let raw: RawFeedback;
  try { raw = await req.json(); } catch { return fail(400, '格式錯誤'); }
  if (!raw || typeof raw !== 'object') return fail(400, '格式錯誤');

  const checked = checkFeedback(raw);
  if ('spam' in checked) return reply(201, { ok: true });
  if ('error' in checked) return fail(400, checked.error);
  const f = checked.ok;

  // Supabase's gateway sits behind Cloudflare, which sets cf-connecting-ip; clients can't forge it
  const ip = (req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0] ?? '').trim();
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const { data: outcome, error } = await sb.rpc('submit_view_feedback', {
    p_venue: f.venue, p_category: f.category, p_message: f.message, p_contact: f.contact, p_page_state: f.pageState,
    p_msg_hash: await sha256(f.venue + ':' + normalizeMessage(f.message)),
    p_ip_hash: ip ? await sha256('idolmaps:view-feedback:ip:' + ipKey(ip)) : null,
  });
  if (error) return fail(500, '送出失敗，請稍後再試');
  if (outcome !== 'ok') { const [status, msg] = REFUSED[outcome] ?? [500, '送出失敗，請稍後再試']; return fail(status, msg); }
  return reply(201, { ok: true });
});
