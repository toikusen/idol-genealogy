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
  const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  // Fetch all groups in parallel, then upsert per group
  await Promise.all((groups ?? []).map(async (group) => {
    const events = await fetchTimetreeEvents(group.timetree_url);
    const activeEvents = events.filter(e => e.starts_at >= threeMonthsAgo);
    const expiredCount = events.length - activeEvents.length;
    console.log(`[${group.name}] fetched ${events.length}, filtered ${expiredCount} expired, upsert ${activeEvents.length}`);
    if (activeEvents.length > 0) {
      console.log(`[${group.name}] titles: ${activeEvents.map(e => e.title).join(' | ')}`);
    }
    if (activeEvents.length === 0) return;

    const rows = activeEvents.map(event => ({
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
      .upsert(rows, { onConflict: "source,source_event_id,group_id", ignoreDuplicates: true });

    if (error) {
      console.error(`[${group.name}] upsert error: ${error.message}`);
    } else {
      totalNew += rows.length;
    }
  }));

  // Atomically claim unnotified events without marking them delivered yet. A stale
  // claim can be retried after 15 minutes if the push send fails mid-flight.
  // Also guard starts_at >= threeMonthsAgo as second layer to skip any expired rows that slipped through.
  const claimCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data: claimed, error: claimError } = await supabase
    .from("group_events")
    .update({ notify_claimed_at: now })
    .is("notified_at", null)
    .or(`notify_claimed_at.is.null,notify_claimed_at.lt.${claimCutoff}`)
    .gte("starts_at", threeMonthsAgo)
    .select("id, group_id, title, url, starts_at, location, groups(name)");

  if (claimError) {
    console.error(`[sync-group-events] claim error: ${claimError.message}`);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  function formatEventDate(isoDate: string | null, includeWeekday = true): string {
    if (!isoDate) return '';
    const d = new Date(isoDate);
    const tw = new Date(d.getTime() + 8 * 60 * 60 * 1000);
    const month = tw.getUTCMonth() + 1;
    const day = tw.getUTCDate();
    if (!includeWeekday) return `${month}月${day}日`;
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    return `${month}月${day}日（${weekdays[tw.getUTCDay()]}）`;
  }

  // Group claimed events by group_id, tracking the earliest starts_at event so that
  // firstTitle/firstUrl/firstStartsAt always refer to the same record.
  const byGroup = new Map<string, { ids: string[]; groupName: string; firstTitle: string; firstUrl: string | null; firstStartsAt: string | null; firstLocation: string | null; count: number }>();
  for (const evt of claimed ?? []) {
    const entry = byGroup.get(evt.group_id);
    if (entry) {
      entry.count++;
      entry.ids.push(evt.id);
      if (evt.starts_at && (!entry.firstStartsAt || evt.starts_at < entry.firstStartsAt)) {
        entry.firstTitle = evt.title;
        entry.firstUrl = evt.url ?? null;
        entry.firstStartsAt = evt.starts_at;
        entry.firstLocation = (evt as any).location ?? null;
      }
    } else {
      byGroup.set(evt.group_id, {
        ids: [evt.id],
        groupName: (evt as any).groups?.name ?? '',
        firstTitle: evt.title,
        firstUrl: evt.url ?? null,
        firstStartsAt: evt.starts_at ?? null,
        firstLocation: (evt as any).location ?? null,
        count: 1,
      });
    }
  }

  console.log(`Pending push notifications: ${claimed?.length ?? 0} events across ${byGroup.size} groups`);

  await Promise.all(Array.from(byGroup.entries()).map(async ([groupId, { ids, groupName, firstTitle, firstUrl, firstStartsAt, firstLocation, count }]) => {
    const { data: favUsers } = await supabase
      .from("user_favorites")
      .select("user_id")
      .eq("entity_type", "group")
      .eq("entity_id", groupId);

    const userIds = (favUsers ?? []).map((f: any) => f.user_id);
    if (userIds.length === 0) {
      await supabase.from("group_events").update({ notified_at: now, notify_claimed_at: null }).in("id", ids);
      return;
    }

    const { data: optedOutRows, error: prefsError } = await supabase
      .from("push_notification_prefs")
      .select("user_id")
      .in("user_id", userIds)
      .eq("notify_event", false);
    if (prefsError) console.error(`[sync-group-events] prefs query error: ${prefsError.message}`);
    const optedOut = prefsError ? new Set<string>() : new Set((optedOutRows ?? []).map((p: any) => p.user_id));
    const filteredIds = userIds.filter((id: string) => !optedOut.has(id));
    if (filteredIds.length === 0) {
      await supabase.from("group_events").update({ notified_at: now, notify_claimed_at: null }).in("id", ids);
      return;
    }

    const targetUrl = count === 1 && firstUrl
      ? `/group/${groupId}?openEvent=${encodeURIComponent(firstUrl)}`
      : `/group/${groupId}`;
    const dateStr = formatEventDate(firstStartsAt, count === 1);
    const notifBody = count === 1
      ? [firstTitle, dateStr || null, firstLocation].filter(Boolean).join('\n')
      : (dateStr ? `${count} 個新活動\n最近 ${dateStr}` : `${count} 個新活動`);
    console.log(`[sync-group-events] sending push for ${groupName}: "${notifBody}" to ${filteredIds.length} user(s)`);
    try {
      const pushRes = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
        body: JSON.stringify({
          user_ids: filteredIds,
          notification: {
            title: `${groupName} 新增活動`,
            body: notifBody,
            icon: "/icons/icon-192x192.png",
            data: { onActionClick: { default: { operation: "navigateLastFocusedOrOpen", url: targetUrl } } },
          },
        }),
      });
      if (!pushRes.ok) {
        const body = await pushRes.text().catch(() => '');
        console.error(`[sync-group-events] send-push-notification HTTP ${pushRes.status} for group ${groupId}: ${body}`);
        return;
      }
      await supabase.from("group_events").update({ notified_at: now, notify_claimed_at: null }).in("id", ids);
    } catch (sendErr) {
      console.error(`[sync-group-events] send push failed for group ${groupId}: ${sendErr}`);
    }
  }));

  // Cleanup expired events (starts_at older than 3 months) — safety net in case anything slipped through
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
    JSON.stringify({ newEvents: totalNew, pushed: claimed?.length ?? 0 }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
