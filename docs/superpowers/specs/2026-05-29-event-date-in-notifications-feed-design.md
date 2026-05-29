# Event Date Display in Notifications & Feed

**Date:** 2026-05-29  
**Status:** Approved

## Problem

Activity notifications and favorites feed entries show only the event title (e.g. "2025 WORLD TOUR IN TAIPEI") with no indication of when the event takes place. Users cannot tell from the notification or feed whether the event is tomorrow or three months away.

## Approved Design

### Push Notification (N1 — plain text, new line, no prefix)

**Single event:**
```
Title:  {groupName} 新增活動
Body:   {eventTitle}
        6月15日（日）
```

**Multiple events:**
```
Title:  {groupName} 新增活動
Body:   {count} 個新活動
        最近 6月15日
```

- No emoji or label prefix — plain text, second line
- Date format: `M月D日（weekday）` for single, `最近 M月D日` for multi (weekday omitted)
- Weekday uses Taiwan locale: 日、一、二、三、四、五、六
- `starts_at` stored as UTC ISO string; convert to UTC+8 before formatting

### Favorites Feed (F1 — SVG calendar icon + gold date text)

```
[avatar] BLACKPINK
         2025 WORLD TOUR IN TAIPEI
         [cal-icon] 6月15日（日）   ← gold rgba(255,214,10,.8), 0.72rem
         剛才  [活動]
```

- Uses the same stroke SVG calendar icon as `push-settings.component.ts` (line 55–57), scaled to 12×12, stroke color `rgba(255,214,10,.8)`
- Rendered only when `eventDate` is present on a feed entry
- Font size: `0.72rem`, color: `rgba(255,214,10,.8)`
- Only applies to `eventType === 'event'` entries

## Implementation Scope

### 1. `supabase/functions/sync-group-events/index.ts`

**Query change (line 209):**  
Add `starts_at` to the `.select()` for claimed events.

**Data tracking:**  
The `byGroup` map currently tracks `firstTitle` and `firstUrl`. Add `firstStartsAt: string | null` to track the nearest event's `starts_at`.

**Body formatting:**  
```ts
function formatEventDate(isoDate: string | null, includeWeekday = true): string {
  if (!isoDate) return '';
  const d = new Date(isoDate);
  const tw = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  const month = tw.getUTCMonth() + 1;
  const day = tw.getUTCDate();
  if (!includeWeekday) return `${month}月${day}日`;
  const weekdays = ['日','一','二','三','四','五','六'];
  return `${month}月${day}日（${weekdays[tw.getUTCDay()]}）`;
}
```

Single event body:
```
{firstTitle}\n📅 {formatEventDate(firstStartsAt)}
```

Multi event body:
```
{count} 個新活動\n📅 最近 {formatEventDate(nearestStartsAt, false)}
```

For multi-event, `nearestStartsAt` = earliest `starts_at` among claimed events in the group.

### 2. `src/app/pages/my-favorites/favorites-feed.component.ts`

**`FeedEntry` interface:** Add optional field `eventDate?: string` (ISO string of `starts_at`).

**Query (line 679):** Add `starts_at` to the `group_events` select.

**Entry mapping (line 689):** Set `eventDate: e.starts_at ?? undefined`.

**Template (line 220 area):** After the title `<a>`, add:
```html
@if (item.eventDate) {
  <div style="font-size:.72rem;color:rgba(255,214,10,.85);margin-bottom:3px;">
    📅 {{ formatEventDate(item.eventDate) }}
  </div>
}
```

**`formatEventDate` method on component:**
```ts
formatEventDate(iso: string): string {
  const d = new Date(iso);
  const tw = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  const month = tw.getUTCMonth() + 1;
  const day = tw.getUTCDate();
  const weekdays = ['日','一','二','三','四','五','六'];
  return `${month}月${day}日（${weekdays[tw.getUTCDay()]}）`;
}
```

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/sync-group-events/index.ts` | Add `starts_at` to claim query; add `formatEventDate`; update notification body |
| `src/app/pages/my-favorites/favorites-feed.component.ts` | Add `eventDate` to `FeedEntry`; add `starts_at` to query; update template + add `formatEventDate` |

## Out of Scope

- Other notification types (birthday, status change, new song) — those already have contextual copy
- Events from member individual schedules (separate feature)
- Time display (e.g. 19:00) — event times in TimetTree are often TBD or all-day
