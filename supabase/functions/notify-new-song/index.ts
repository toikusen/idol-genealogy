import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": "*" } });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const payload = await req.json();
  const record = payload.record;
  if (!record) return new Response("no record", { status: 400 });

  const isGroupSong = payload.table === "group_songs";
  const entityType = isGroupSong ? "group" : "member";
  const entityId = isGroupSong ? record.group_id : record.member_id;
  if (!entityId) return new Response("no entity", { status: 400 });

  let entityName = "";
  if (isGroupSong) {
    const { data } = await supabase.from("groups").select("name").eq("id", entityId).single();
    entityName = data?.name ?? "";
  } else {
    const { data } = await supabase.from("members").select("name").eq("id", entityId).single();
    entityName = data?.name ?? "";
  }

  const { data: favUsers } = await supabase
    .from("user_favorites").select("user_id").eq("entity_type", entityType).eq("entity_id", entityId);

  const userIds = (favUsers ?? []).map((f: any) => f.user_id);
  if (userIds.length === 0) return new Response("no subscribers", { status: 200 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
    body: JSON.stringify({
      user_ids: userIds,
      notification: {
        title: `${entityName} 新增歌曲`,
        body: record.title ?? "新歌上線",
        icon: "/icons/icon-192x192.png",
        data: { onActionClick: { default: { operation: "navigateLastFocusedOrOpen", url: isGroupSong ? `/group/${entityId}` : `/member/${entityId}` } } },
      },
    }),
  });

  return new Response("ok", { status: 200 });
});
