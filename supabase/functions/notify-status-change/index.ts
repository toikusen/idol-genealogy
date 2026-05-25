import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const NOTIFIABLE_STATUSES = ['active', 'graduated', 'withdrawn', 'hiatus'];
const STATUS_LABELS: Record<string, string> = {
  graduated: '畢業', withdrawn: '退出', hiatus: '進入休息',
};

function statusLabel(
  status: string,
  groupName: string | null,
  context: { eventType: string; oldStatus?: string | null },
): string {
  const g = groupName ? `《${groupName}》` : '';
  if (status === 'active') {
    if (context.eventType === 'INSERT') return g ? `在${g}正常在籍` : '正常在籍';
    if (context.oldStatus === 'hiatus') return `從${g}復歸`;
    return g ? `更新為${g}正常在籍` : '更新為正常在籍';
  }
  return STATUS_LABELS[status] ?? status;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": "*" } });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const payload = await req.json();
  const record = payload.record;
  const oldRecord = payload.old_record;

  if (!record?.member_id) return new Response("no member_id", { status: 400 });

  const newStatus = record.status;
  const oldStatus = oldRecord?.status;

  if (!NOTIFIABLE_STATUSES.includes(newStatus)) return new Response("not notifiable", { status: 200 });
  if (payload.type === "UPDATE" && oldStatus === newStatus) return new Response("no change", { status: 200 });

  const { data: member } = await supabase.from("members").select("name").eq("id", record.member_id).single();
  if (!member) return new Response("member not found", { status: 200 });

  let groupName: string | null = null;
  if (record.group_id) {
    const { data: group } = await supabase.from("groups").select("name").eq("id", record.group_id).maybeSingle();
    groupName = group?.name ?? null;
  }

  const { data: favUsers } = await supabase
    .from("user_favorites").select("user_id").eq("entity_type", "member").eq("entity_id", record.member_id);

  const userIds = (favUsers ?? []).map((f: any) => f.user_id);
  if (userIds.length === 0) return new Response("no subscribers", { status: 200 });

  const { data: optedOutRows, error: prefsError } = await supabase
    .from("push_notification_prefs")
    .select("user_id")
    .in("user_id", userIds)
    .eq("notify_status", false);
  const optedOut = prefsError ? new Set<string>() : new Set((optedOutRows ?? []).map((p: any) => p.user_id));
  const filteredIds = userIds.filter((id: string) => !optedOut.has(id));
  if (filteredIds.length === 0) return new Response("all opted out", { status: 200 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
    body: JSON.stringify({
      user_ids: filteredIds,
      notification: {
        title: `${member.name} 狀態更新`,
        body: statusLabel(newStatus, groupName, { eventType: payload.type, oldStatus }),
        icon: "/icons/icon-192x192.png",
        data: { onActionClick: { default: { operation: "navigateLastFocusedOrOpen", url: `/member/${record.member_id}` } } },
      },
    }),
  });

  return new Response("ok", { status: 200 });
});
