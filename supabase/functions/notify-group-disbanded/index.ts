import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": "*" } });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const payload = await req.json();
  const record = payload.record;
  const oldRecord = payload.old_record;

  // Only trigger when disbanded_at transitions from null to a value
  if (!record?.disbanded_at || oldRecord?.disbanded_at) {
    return new Response("not a disband event", { status: 200 });
  }

  const groupId = record.id;
  const groupName = record.name ?? "";

  const { data: favUsers } = await supabase
    .from("user_favorites")
    .select("user_id")
    .eq("entity_type", "group")
    .eq("entity_id", groupId);

  const userIds = (favUsers ?? []).map((f: any) => f.user_id);
  if (userIds.length === 0) return new Response("no subscribers", { status: 200 });

  const { data: optedOutRows, error: prefsError } = await supabase
    .from("push_notification_prefs")
    .select("user_id")
    .in("user_id", userIds)
    .eq("notify_disbanded", false);
  if (prefsError) console.error(`[notify-group-disbanded] prefs query error: ${prefsError.message}`);
  const optedOut = prefsError ? new Set<string>() : new Set((optedOutRows ?? []).map((p: any) => p.user_id));
  const filteredIds = userIds.filter((id: string) => !optedOut.has(id));
  if (filteredIds.length === 0) return new Response("all opted out", { status: 200 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const pushRes = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: JSON.stringify({
      user_ids: filteredIds,
      notification: {
        title: `${groupName} 發布解散公告`,
        body: `預定解散日期：${new Date(record.disbanded_at).toLocaleDateString('zh-TW')}`,
        icon: "/icons/icon-192x192.png",
        data: {
          onActionClick: {
            default: {
              operation: "navigateLastFocusedOrOpen",
              url: `/group/${groupId}`,
            },
          },
        },
      },
    }),
  });
  if (!pushRes.ok) {
    const body = await pushRes.text().catch(() => "");
    console.error(`[notify-group-disbanded] send-push HTTP ${pushRes.status}: ${body}`);
  }

  console.log(`[notify-group-disbanded] ${groupName} — notified ${filteredIds.length} user(s)`);
  return new Response(JSON.stringify({ notified: filteredIds.length }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
