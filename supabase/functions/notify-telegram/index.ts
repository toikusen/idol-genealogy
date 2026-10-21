// Called by the notify_telegram() trigger (migration 120) on proposals / audit_log inserts.
// The trigger signs each call with x-webhook-secret, read from Vault; anything unsigned is refused.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Data, formatMessage, Names, refIds, sides, WebhookPayload } from "./format.ts";

const telegram = (method: string, body: Data) =>
  fetch(`https://api.telegram.org/bot${Deno.env.get("TELEGRAM_BOT_TOKEN")}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: Deno.env.get("TELEGRAM_CHAT_ID"), ...body }),
  });

serve(async (req) => {
  const secret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  if (!secret || req.headers.get("x-webhook-secret") !== secret) return new Response("forbidden", { status: 403 });

  const payload: WebhookPayload = await req.json();
  const s = sides(payload);
  if (!s) return new Response("skip");

  // lookups only enrich the message; a failed one falls back to raw ids
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const current = s.recordId && s.op !== "DELETE"
    ? (await supabase.from(s.table).select("*").eq("id", s.recordId).maybeSingle()).data as Data | null
    : null;
  const names: Names = {};
  await Promise.all(Object.entries(refIds([current ?? {}, s.before, s.after])).map(async ([table, ids]) => {
    const { data } = await supabase.from(table).select("id, name").in("id", ids);
    for (const row of data ?? []) names[row.id] = row.name;
  }));

  const msg = formatMessage(payload, current, names);
  if (!msg) return new Response("skip");

  const res = await telegram("sendMessage", { text: msg.text, disable_web_page_preview: true });
  for (const p of msg.photos) await telegram("sendPhoto", { photo: p.url, caption: `${p.label}（新）` });
  return new Response(await res.text(), { status: res.ok ? 200 : 502 });
});
