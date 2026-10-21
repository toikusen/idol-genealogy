// Called by the notify_telegram() trigger (migration 120) on proposals / audit_log inserts.
// The trigger signs each call with x-webhook-secret, read from Vault; anything unsigned is refused.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { formatMessage } from "./format.ts";

serve(async (req) => {
  const secret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  if (!secret || req.headers.get("x-webhook-secret") !== secret) return new Response("forbidden", { status: 403 });

  const text = formatMessage(await req.json());
  if (!text) return new Response("skip");

  const res = await fetch(`https://api.telegram.org/bot${Deno.env.get("TELEGRAM_BOT_TOKEN")}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: Deno.env.get("TELEGRAM_CHAT_ID"), text, disable_web_page_preview: true }),
  });
  return new Response(await res.text(), { status: res.ok ? 200 : 502 });
});
