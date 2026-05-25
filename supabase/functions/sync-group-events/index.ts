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

interface TimetreeApiEvent {
  id: string;
  title: string;
  location_name: string | null;
  all_day: boolean;
  start_at: number;
  end_at: number;
  url: string | null;
}

interface TimetreeApiResponse {
  paging: { next: boolean; next_cursor?: string };
  public_events: TimetreeApiEvent[];
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

async function resolveAlias(timetreeUrl: string): Promise<string | null> {
  // https://timetreeapp.com/public_calendars/{alias}
  const pubMatch = timetreeUrl.match(/timetreeapp\.com\/public_calendars\/([^/?#]+)/);
  if (pubMatch) return pubMatch[1];

  // https://timetreeapp.com/calendars/{alias}
  const calMatch = timetreeUrl.match(/timetreeapp\.com\/calendars\/([^/?#]+)/);
  if (calMatch) return calMatch[1];

  // https://timetr.ee/p/{slug} — follow redirect
  if (timetreeUrl.includes('timetr.ee')) {
    try {
      const res = await fetch(timetreeUrl, { redirect: 'follow', signal: AbortSignal.timeout(10000) });
      return resolveAlias(res.url);
    } catch (err) {
      console.error(`[timetree] failed to resolve short URL ${timetreeUrl}: ${err}`);
      return null;
    }
  }

  return null;
}

async function fetchTimetreeEvents(timetreeUrl: string, daysAhead = 90): Promise<CalendarEvent[]> {
  const alias = await resolveAlias(timetreeUrl);
  if (!alias) {
    console.error(`[timetree] cannot extract alias from: ${timetreeUrl}`);
    return [];
  }

  const DAY_MS = 24 * 60 * 60 * 1000;
  const utcOffsetMs = 8 * 60 * 60 * 1000;
  const todayStart = Math.floor((Date.now() + utcOffsetMs) / DAY_MS) * DAY_MS - utcOffsetMs;
  const from = todayStart;
  const to = todayStart + daysAhead * DAY_MS;

  const headers: HeadersInit = {
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8,ja;q=0.7',
    Referer: `https://timetreeapp.com/public_calendars/${alias}`,
    Origin: 'https://timetreeapp.com',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
    'X-TimeTreeA': 'web/2.1.0/en',
  };

  const events: CalendarEvent[] = [];
  let cursor: string | undefined;
  let page = 0;
  const MAX_PAGES = 5;

  do {
    const params = new URLSearchParams({
      from: String(from),
      to: String(to),
      utc_offset: '480',
      limit: '100',
    });
    if (cursor) params.set('cursor', cursor);

    const apiUrl = `https://timetreeapp.com/api/v2/public_calendars/${alias}/public_events?${params}`;

    try {
      const res = await fetch(apiUrl, { headers, signal: AbortSignal.timeout(10000) });
      if (res.status === 404) {
        if (page === 0) console.error(`[timetree] 404 for alias: ${alias}`);
        break;
      }
      if (!res.ok) {
        console.error(`[timetree] HTTP ${res.status} for ${alias}`);
        break;
      }

      const data: TimetreeApiResponse = await res.json();
      for (const e of data.public_events) {
        const start = new Date(e.start_at).toISOString();
        let end: string | undefined;
        if (e.all_day) {
          if (e.end_at > e.start_at) end = new Date(e.end_at + DAY_MS).toISOString();
        } else {
          end = new Date(e.end_at).toISOString();
        }
        events.push({
          id: String(e.id),
          title: e.title,
          starts_at: start,
          ends_at: end,
          location: e.location_name ?? undefined,
          url: e.url ?? undefined,
        });
      }

      cursor = data.paging.next ? data.paging.next_cursor : undefined;
      page++;
    } catch (err) {
      console.error(`[timetree] fetch error for ${alias}: ${err}`);
      break;
    }
  } while (cursor && page < MAX_PAGES);

  return events;
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

  console.log(`Found ${groups?.length ?? 0} groups with timetree_url`);

  let totalNew = 0;
  const now = new Date().toISOString();

  // Fetch all groups in parallel, then upsert per group
  await Promise.all((groups ?? []).map(async (group) => {
    const events = await fetchTimetreeEvents(group.timetree_url);
    console.log(`[${group.name}] fetched ${events.length} events`);
    if (events.length === 0) return;

    const rows = events.map(event => ({
      group_id: group.id,
      source: "timetree",
      source_event_id: event.id,
      title: event.title,
      starts_at: event.starts_at,
      ends_at: event.ends_at ?? null,
      location: event.location ?? null,
      url: event.url ?? null,
      content_hash: contentHash(event),
      last_seen_at: now,
    }));

    const { error } = await supabase
      .from("group_events")
      .upsert(rows, { onConflict: "source,source_event_id,group_id", ignoreDuplicates: false });

    if (error) {
      console.error(`[${group.name}] upsert error: ${error.message}`);
    } else {
      totalNew += rows.length;
    }
  }));

  // Push notifications — group unnotified events by group_id to minimise queries
  const { data: unnotified } = await supabase
    .from("group_events")
    .select("id, group_id, title, url, groups(name)")
    .is("notified_at", null);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Group by group_id
  const byGroup = new Map<string, { ids: string[]; groupName: string; firstTitle: string; firstUrl: string | null; count: number }>();
  for (const evt of unnotified ?? []) {
    const entry = byGroup.get(evt.group_id);
    if (entry) {
      entry.ids.push(evt.id);
      entry.count++;
    } else {
      byGroup.set(evt.group_id, {
        ids: [evt.id],
        groupName: (evt as any).groups?.name ?? '',
        firstTitle: evt.title,
        firstUrl: evt.url ?? null,
        count: 1,
      });
    }
  }

  console.log(`Pending push notifications: ${unnotified?.length ?? 0} events across ${byGroup.size} groups`);

  await Promise.all(Array.from(byGroup.entries()).map(async ([groupId, { ids, groupName, firstTitle, firstUrl, count }]) => {
    const { data: favUsers } = await supabase
      .from("user_favorites")
      .select("user_id")
      .eq("entity_type", "group")
      .eq("entity_id", groupId);

    const userIds = (favUsers ?? []).map((f: any) => f.user_id);
    if (userIds.length > 0) {
      const { data: optedOutRows, error: prefsError } = await supabase
        .from("push_notification_prefs")
        .select("user_id")
        .in("user_id", userIds)
        .eq("notify_event", false);
      const optedOut = prefsError ? new Set<string>() : new Set((optedOutRows ?? []).map((p: any) => p.user_id));
      const filteredIds = userIds.filter((id: string) => !optedOut.has(id));
      if (filteredIds.length > 0) {
        const targetUrl = count === 1 && firstUrl ? firstUrl : `/group/${groupId}`;
        await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
          body: JSON.stringify({
            user_ids: filteredIds,
            notification: {
              title: `${groupName} 新增活動`,
              body: count === 1 ? firstTitle : `${count} 個新活動`,
              icon: "/icons/icon-192x192.png",
              data: { onActionClick: { default: { operation: "navigateLastFocusedOrOpen", url: targetUrl } } },
            },
          }),
        });
      }
    }

    await supabase
      .from("group_events")
      .update({ notified_at: now })
      .in("id", ids);
  }));

  // Cleanup expired events (starts_at older than 3 months)
  const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { error: cleanupError, count: cleanupCount } = await supabase
    .from("group_events")
    .delete({ count: "exact" })
    .lt("starts_at", threeMonthsAgo);
  if (cleanupError) {
    console.error(`[sync] cleanup error: ${cleanupError.message}`);
  } else {
    console.log(`[sync] cleaned up ${cleanupCount ?? 0} expired events`);
  }

  return new Response(
    JSON.stringify({ newEvents: totalNew, pushed: unnotified?.length ?? 0 }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
