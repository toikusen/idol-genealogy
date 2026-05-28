import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": "*" } });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Today's MM-DD in Taiwan time (UTC+8)
  const now = new Date();
  const taiwanDate = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const month = String(taiwanDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(taiwanDate.getUTCDate()).padStart(2, "0");
  const today = `${month}-${day}`;
  const birthdayOn = `${taiwanDate.getUTCFullYear()}-${month}-${day}`;

  const { data: members, error } = await supabase
    .from("members")
    .select("id, name")
    .eq("birthdate", today);

  if (error) {
    console.error(`[notify-birthdays] query error: ${error.message}`);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  console.log(`[notify-birthdays] ${today} — ${members?.length ?? 0} member(s)`);

  if (!members || members.length === 0) {
    return new Response(JSON.stringify({ notified: 0 }), { status: 200 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  let notified = 0;

  await Promise.all(members.map(async (member) => {
    const { data: favUsers } = await supabase
      .from("user_favorites")
      .select("user_id")
      .eq("entity_type", "member")
      .eq("entity_id", member.id);

    const userIds = (favUsers ?? []).map((f: any) => f.user_id);
    if (userIds.length === 0) return;

    const { data: optedOutRows, error: prefsError } = await supabase
      .from("push_notification_prefs")
      .select("user_id")
      .in("user_id", userIds)
      .eq("notify_birthday", false);
    if (prefsError) console.error(`[notify-birthdays] prefs query error: ${prefsError.message}`);
    const optedOut = prefsError ? new Set<string>() : new Set((optedOutRows ?? []).map((p: any) => p.user_id));
    const filteredIds = userIds.filter((id: string) => !optedOut.has(id));
    if (filteredIds.length === 0) return;

    const claimedIds: string[] = [];
    await Promise.all(filteredIds.map(async (userId: string) => {
      const { error: claimError } = await supabase
        .from("birthday_push_notifications")
        .insert({ user_id: userId, member_id: member.id, birthday_on: birthdayOn });
      if (!claimError) claimedIds.push(userId);
      else if (claimError.code !== "23505") {
        console.error(`[notify-birthdays] claim error for ${member.id}/${userId}: ${claimError.message}`);
      }
    }));

    if (claimedIds.length === 0) return;

    const pushRes = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        user_ids: claimedIds,
        notification: {
          title: `${member.name} 生日快樂！`,
          body: `今天是 ${member.name} 的生日`,
          icon: "/icons/icon-192x192.png",
          data: {
            onActionClick: {
              default: {
                operation: "navigateLastFocusedOrOpen",
                url: `/member/${member.id}`,
              },
            },
          },
        },
      }),
    });

    if (!pushRes.ok) {
      const body = await pushRes.text().catch(() => "");
      console.error(`[notify-birthdays] send-push HTTP ${pushRes.status}: ${body}`);
      await supabase
        .from("birthday_push_notifications")
        .delete()
        .eq("member_id", member.id)
        .eq("birthday_on", birthdayOn)
        .in("user_id", claimedIds);
      return;
    }

    await supabase
      .from("birthday_push_notifications")
      .update({ delivered_at: new Date().toISOString() })
      .eq("member_id", member.id)
      .eq("birthday_on", birthdayOn)
      .in("user_id", claimedIds);

    notified += claimedIds.length;
    console.log(`[notify-birthdays] ${member.name} — notified ${claimedIds.length} user(s)`);
  }));

  return new Response(JSON.stringify({ notified, members: members.length }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
