import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CalendarEvent {
  id: string;
  title: string;
  starts_at: string;
  ends_at?: string;
  location?: string;
  url?: string;
}

function contentHash(event: CalendarEvent): string {
  const str = `${event.title}|${event.starts_at}|${event.location ?? ''}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

async function fetchTimetreeEvents(timetreeUrl: string): Promise<CalendarEvent[]> {
  const calId = timetreeUrl.split('/calendars/')[1]?.split('/')[0];
  if (!calId) return [];
  const icalUrl = `https://timetreeapp.com/calendars/${calId}/public_icals/timetree.ics`;
  try {
    const res = await fetch(icalUrl, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const ical = await res.text();
    return parseIcal(ical);
  } catch {
    return [];
  }
}

function parseIcal(ical: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const blocks = ical.split('BEGIN:VEVENT');
  for (const block of blocks.slice(1)) {
    const get = (key: string) => {
      const match = block.match(new RegExp(`${key}[^:]*:(.+)`));
      return match ? match[1].trim().replace(/\\n/g, '\n').replace(/\\,/g, ',') : undefined;
    };
    const uid = get('UID');
    const summary = get('SUMMARY');
    const dtstart = get('DTSTART');
    const dtend = get('DTEND');
    const location = get('LOCATION');
    const url = get('URL');
    if (uid && summary && dtstart) {
      events.push({
        id: uid,
        title: summary,
        starts_at: parseIcalDate(dtstart),
        ends_at: dtend ? parseIcalDate(dtend) : undefined,
        location,
        url,
      });
    }
  }
  return events;
}

function parseIcalDate(dateStr: string): string {
  const clean = dateStr.replace(/[TZ]/g, '');
  if (clean.length === 8) {
    return `${clean.slice(0,4)}-${clean.slice(4,6)}-${clean.slice(6,8)}T00:00:00Z`;
  }
  return `${clean.slice(0,4)}-${clean.slice(4,6)}-${clean.slice(6,8)}T${clean.slice(8,10)}:${clean.slice(10,12)}:${clean.slice(12,14)}Z`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: groups } = await supabase
    .from("groups")
    .select("id, name, timetree_url")
    .not("timetree_url", "is", null);

  let totalNew = 0;

  for (const group of groups ?? []) {
    const events = await fetchTimetreeEvents(group.timetree_url);
    for (const event of events) {
      const hash = contentHash(event);
      const { data: existing } = await supabase
        .from("group_events")
        .select("id, content_hash")
        .eq("source", "timetree")
        .eq("source_event_id", event.id)
        .eq("group_id", group.id)
        .maybeSingle();

      if (!existing) {
        await supabase.from("group_events").insert({
          group_id: group.id,
          source: "timetree",
          source_event_id: event.id,
          title: event.title,
          starts_at: event.starts_at,
          ends_at: event.ends_at,
          location: event.location,
          url: event.url,
          content_hash: hash,
        });
        totalNew++;
      } else {
        const updates: Record<string, unknown> = { last_seen_at: new Date().toISOString() };
        if (existing.content_hash !== hash) updates.content_hash = hash;
        await supabase.from("group_events").update(updates).eq("id", existing.id);
      }
    }
  }

  // Send push for new events (notified_at IS NULL)
  const { data: newEvents } = await supabase
    .from("group_events")
    .select("id, group_id, title, url, groups(name)")
    .is("notified_at", null);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  for (const evt of newEvents ?? []) {
    const { data: favUsers } = await supabase
      .from("user_favorites")
      .select("user_id")
      .eq("entity_type", "group")
      .eq("entity_id", evt.group_id);

    const userIds = (favUsers ?? []).map((f: any) => f.user_id);
    if (userIds.length > 0) {
      await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
        body: JSON.stringify({
          user_ids: userIds,
          notification: {
            title: `${(evt as any).groups?.name ?? ''} 新增活動`,
            body: evt.title,
            icon: "/icons/icon-192x192.png",
            data: { onActionClick: { default: { operation: "navigateLastFocusedOrOpen", url: `/group/${evt.group_id}` } } },
          },
        }),
      });
    }
    await supabase.from("group_events").update({ notified_at: new Date().toISOString() }).eq("id", evt.id);
  }

  return new Response(
    JSON.stringify({ newEvents: totalNew, pushed: newEvents?.length ?? 0 }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
