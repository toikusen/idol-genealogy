// Anonymous feedback from the 別擋我推 page (/view). Deploy with --no-verify-jwt.
//
// Rows go to `view_feedback`, readable only by admins. Guards, cheapest first:
// honeypot + fill-time trap, content rules, Turnstile (when TURNSTILE_SECRET is set),
// 3 per IP per 10 minutes and 10 per day, no repeat of the same text within 7 days,
// and a ceiling of 300 a day overall.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkFeedback, normalizeMessage, RawFeedback } from './check.ts';

const PER_IP_BURST = 3, BURST_MS = 10 * 60e3;
const PER_IP_PER_DAY = 10;
const DAILY_CAP = 300;
const DAY = 864e5;
const ORIGINS = [/^https:\/\/idolmaps\.com$/, /^https:\/\/[a-z0-9-]+\.idol-genealogy\.pages\.dev$/, /^http:\/\/localhost:\d+$/];

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('');
const sha256 = async (s: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));

async function turnstileOk(secret: string, token: string, ip: string): Promise<boolean> {
  if (!token) return false;
  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  if (ip) body.append('remoteip', ip);
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    return (await r.json()).success === true;
  } catch {
    return false;
  }
}

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

  let raw: RawFeedback & { 'cf-turnstile-response'?: unknown };
  try { raw = await req.json(); } catch { return fail(400, '格式錯誤'); }
  if (!raw || typeof raw !== 'object') return fail(400, '格式錯誤');

  const checked = checkFeedback(raw);
  if ('spam' in checked) return reply(201, { ok: true });
  if ('error' in checked) return fail(400, checked.error);
  const f = checked.ok;

  // Supabase's gateway sits behind Cloudflare, which sets cf-connecting-ip; clients can't forge it
  const ip = (req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0] ?? '').trim();
  const secret = Deno.env.get('TURNSTILE_SECRET');
  if (secret && !(await turnstileOk(secret, typeof raw['cf-turnstile-response'] === 'string' ? raw['cf-turnstile-response'] : '', ip))) {
    return fail(403, '人機驗證沒有通過，請重新整理頁面再試一次');
  }

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const now = Date.now(), since = (ms: number) => new Date(now - ms).toISOString();
  const ipHash = ip ? await sha256('idolmaps:view-feedback:ip:' + ip) : null;
  const msgHash = await sha256(normalizeMessage(f.message));
  const count = async (col: string, val: string, ms: number) =>
    (await sb.from('view_feedback').select('id', { count: 'exact', head: true }).eq(col, val).gte('created_at', since(ms))).count ?? 0;

  if (ipHash) {
    if (await count('ip_hash', ipHash, BURST_MS) >= PER_IP_BURST) return fail(429, '送出太頻繁了，請過幾分鐘再試');
    if (await count('ip_hash', ipHash, DAY) >= PER_IP_PER_DAY) return fail(429, '今天的回報次數已達上限，明天再試');
  }
  if (await count('msg_hash', msgHash, 7 * DAY) > 0) return fail(409, '已經收到相同的內容了，謝謝你！');
  const { count: today } = await sb.from('view_feedback').select('id', { count: 'exact', head: true }).gte('created_at', since(DAY));
  if ((today ?? 0) >= DAILY_CAP) return fail(503, '今天收到的回報太多了，請明天再試');

  const ins = await sb.from('view_feedback').insert({
    venue: f.venue, category: f.category, message: f.message, contact: f.contact, page_state: f.pageState,
    msg_hash: msgHash, ip_hash: ipHash,
  });
  if (ins.error) return fail(500, '送出失敗，請稍後再試');
  return reply(201, { ok: true });
});
