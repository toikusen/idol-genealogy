interface TimeTreeEvent {
  id: string;
  title: string;
  location_name: string | null;
  all_day: boolean;
  start_at: number;
  end_at: number;
  url: string | null;
}

interface TimeTreeResponse {
  paging: { next: boolean; next_cursor?: string };
  public_events: TimeTreeEvent[];
}

interface VenueCalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string | null;
  location: string | null;
  url: string | null;
  isAllDay: boolean;
}

const cache = new Map<string, { data: VenueCalendarEvent[]; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_PAGES = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

function toVenueEvent(e: TimeTreeEvent): VenueCalendarEvent {
  const start = new Date(e.start_at).toISOString();
  let end: string | null = null;
  if (e.all_day) {
    if (e.end_at > e.start_at) {
      end = new Date(e.end_at + DAY_MS).toISOString();
    }
  } else {
    end = new Date(e.end_at).toISOString();
  }
  return {
    id: String(e.id),
    title: e.title,
    start,
    end,
    location: e.location_name || null,
    url: e.url ?? null,
    isAllDay: e.all_day,
  };
}

function timetreeHeaders(alias: string): HeadersInit {
  return {
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8,ja;q=0.7',
    Referer: `https://timetreeapp.com/public_calendars/${alias}`,
    Origin: 'https://timetreeapp.com',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
    'X-TimeTreeA': 'web/2.1.0/en',
  };
}

export const onRequest: PagesFunction = async ({ request }) => {
  const url = new URL(request.url);
  const alias = url.searchParams.get('alias');
  const rawDays = parseInt(url.searchParams.get('days') ?? '90', 10);
  const days = Math.max(1, Math.min(365, isNaN(rawDays) ? 90 : rawDays));

  if (!alias || !/^[\w-]+$/.test(alias)) return new Response('Invalid alias', { status: 400 });

  const cacheKey = `${alias}:${days}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return Response.json(cached.data);
  }

  try {
    const utcOffsetMs = 8 * 60 * 60 * 1000;
    const todayStartTW = Math.floor((Date.now() + utcOffsetMs) / DAY_MS) * DAY_MS - utcOffsetMs;
    const from = todayStartTW;
    const to = todayStartTW + days * DAY_MS;

    const allEvents: VenueCalendarEvent[] = [];
    let cursor: string | undefined;
    let page = 0;

    do {
      const params = new URLSearchParams({
        from: String(from),
        to: String(to),
        utc_offset: '480',
        limit: '100',
      });
      if (cursor) params.set('cursor', cursor);

      const res = await fetch(
        `https://timetreeapp.com/api/v2/public_calendars/${alias}/public_events?${params}`,
        { headers: timetreeHeaders(alias) }
      );

      if (res.status === 404) {
        if (page === 0) return Response.json([]);
        break;
      }
      if (!res.ok) return new Response(`TimeTree error ${res.status}`, { status: 503 });

      const data: TimeTreeResponse = await res.json();
      allEvents.push(...data.public_events.map(toVenueEvent));
      cursor = data.paging.next ? data.paging.next_cursor : undefined;
      page++;
    } while (cursor && page < MAX_PAGES);

    const futureEvents = allEvents.filter(e => new Date(e.start).getTime() >= from);
    cache.set(cacheKey, { data: futureEvents, expiresAt: Date.now() + CACHE_TTL_MS });
    return Response.json(futureEvents);
  } catch {
    return new Response('Internal error', { status: 503 });
  }
};
