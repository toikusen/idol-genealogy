// Anonymous venue floor-plan upload (/upload-plan). Deploy with --no-verify-jwt.
//
// Nothing uploaded here is public: files go to the private `venue-plans`
// bucket as `pending` and an admin reviews them in /admin/venue-plans.
// Guards, cheapest first: Turnstile (when TURNSTILE_SECRET is set), size,
// magic bytes, duplicate hash, 5 uploads per IP per day, and a 300 MB ceiling
// on everything still waiting for review.
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { field, isEmail, isHttpUrl, MAX_BYTES, sniff } from './sniff.ts';

const PER_IP_PER_DAY = 5;
const PENDING_CAP_BYTES = 300 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORIGINS = [/^https:\/\/idolmaps\.com$/, /^https:\/\/[a-z0-9-]+\.idol-genealogy\.pages\.dev$/, /^http:\/\/localhost:\d+$/];

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('');
const sha256 = async (data: Uint8Array | string) =>
  hex(await crypto.subtle.digest('SHA-256', (typeof data === 'string' ? new TextEncoder().encode(data) : data) as BufferSource));

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

// rejected after 7 days, never reviewed after 30: drop the rows and their files
async function sweep(sb: SupabaseClient) {
  const day = 864e5, now = Date.now();
  const { data } = await sb.from('venue_plans').select('id, storage_path')
    .or(`and(status.eq.rejected,reviewed_at.lt.${new Date(now - 7 * day).toISOString()}),` +
        `and(status.eq.pending,created_at.lt.${new Date(now - 30 * day).toISOString()})`)
    .limit(50);
  if (!data?.length) return;
  await sb.storage.from('venue-plans').remove(data.map(r => r.storage_path));
  await sb.from('venue_plans').delete().in('id', data.map(r => r.id));
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

  let form: FormData;
  try { form = await req.formData(); } catch { return fail(400, '表單格式錯誤'); }

  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return fail(400, '請選擇要上傳的檔案');
  if (file.size > MAX_BYTES) return fail(413, '檔案超過 15MB，請壓縮後再上傳');
  const venueId = field(form.get('venue_id'), 36) ?? '';
  if (!UUID.test(venueId)) return fail(400, '請選擇場館');
  if (form.get('license_ack') !== '1') return fail(400, '請勾選授權說明');
  const email = field(form.get('contact_email'), 200);
  if (email && !isEmail(email)) return fail(400, 'Email 格式不正確');
  const sourceUrl = field(form.get('source_url'), 500);
  if (sourceUrl && !isHttpUrl(sourceUrl)) return fail(400, '來源網址要以 http:// 或 https:// 開頭');

  // Supabase's gateway sits behind Cloudflare, which sets cf-connecting-ip; clients can't forge it
  const ip = (req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0] ?? '').trim();
  const secret = Deno.env.get('TURNSTILE_SECRET');
  if (secret && !(await turnstileOk(secret, field(form.get('cf-turnstile-response'), 2048) ?? '', ip))) {
    return fail(403, '人機驗證沒有通過，請重新整理頁面再試一次');
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniff(bytes);
  if (!kind) return fail(415, '只接受 JPG、PNG、WebP 圖片或 PDF');

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const hash = await sha256(bytes);
  const ipHash = ip ? await sha256('idolmaps:venue-plan:ip:' + ip) : null;

  const { data: venue } = await sb.from('venues').select('id').eq('id', venueId).maybeSingle();
  if (!venue) return fail(400, '找不到這個場館');
  const { data: dup } = await sb.from('venue_plans').select('id').eq('sha256', hash).maybeSingle();
  if (dup) return fail(409, '這個檔案已經有人上傳過了，謝謝你！');
  if (ipHash) {
    const { count } = await sb.from('venue_plans').select('id', { count: 'exact', head: true })
      .eq('ip_hash', ipHash).gte('created_at', new Date(Date.now() - 864e5).toISOString());
    if ((count ?? 0) >= PER_IP_PER_DAY) return fail(429, '今天的上傳次數已達上限，明天再試');
  }
  const { data: pending } = await sb.from('venue_plans').select('size_bytes').eq('status', 'pending');
  const queued = (pending ?? []).reduce((s, r) => s + r.size_bytes, 0);
  if (queued + bytes.length > PENDING_CAP_BYTES) return fail(503, '待審核的檔案太多，請過幾天再上傳');

  const path = `${venueId}/${crypto.randomUUID()}.${kind.ext}`;
  const up = await sb.storage.from('venue-plans').upload(path, bytes, { contentType: kind.mime, upsert: false });
  if (up.error) return fail(500, '上傳失敗，請稍後再試');
  const ins = await sb.from('venue_plans').insert({
    venue_id: venueId, storage_path: path, sha256: hash, mime: kind.mime, size_bytes: bytes.length,
    known_dimension: field(form.get('known_dimension'), 200), source_url: sourceUrl,
    contact_email: email, note: field(form.get('note'), 500), ip_hash: ipHash,
  });
  if (ins.error) {
    await sb.storage.from('venue-plans').remove([path]);
    return ins.error.code === '23505' ? fail(409, '這個檔案已經有人上傳過了，謝謝你！') : fail(500, '上傳失敗，請稍後再試');
  }

  // @ts-ignore EdgeRuntime is provided by the Supabase runtime
  EdgeRuntime.waitUntil(sweep(sb));
  return reply(201, { ok: true });
});
