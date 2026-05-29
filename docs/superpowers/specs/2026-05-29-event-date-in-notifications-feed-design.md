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

- Uses the same stroke SVG calendar icon as `push-settings.component.ts` (`rect x=3 y=4` calendar path), scaled to 12×12, stroke color `rgba(255,214,10,.8)`
- No emoji — inline SVG only
- Rendered with condition `item.eventType === 'event' && item.eventDate`
- Font size: `0.72rem`, color: `rgba(255,214,10,.8)`

## Implementation Scope

### 1. `supabase/functions/sync-group-events/index.ts`

**Claim query select:**  
Add `starts_at` to the `.select()` on the claim query (currently selects `id, group_id, title, url, groups(name)`).

**`byGroup` map — data consistency:**  
The current `firstTitle` / `firstUrl` fields capture the first record returned by the claim query, which is not necessarily the event with the earliest `starts_at`. Fix:

- Track `nearestStartsAt` separately: computed as `min(starts_at)` across all claimed events in the group.
- For the single-event case (`count === 1`), `firstTitle` and `firstStartsAt` must come from the **same record** — the one with the earliest `starts_at`. Sort or pick accordingly when building the `byGroup` entry.
- This ensures the displayed date always matches the displayed title.

**Body formatting — no emoji prefix:**
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

Single event body (no emoji):
```
`${firstTitle}\n${formatEventDate(firstStartsAt)}`
```

Multi event body (no emoji):
```
`${count} 個新活動\n最近 ${formatEventDate(nearestStartsAt, false)}`
```

### 2. `src/app/pages/my-favorites/favorites-feed.component.ts`

**`FeedEntry` interface:** Add optional field `eventDate?: string` (ISO string of `starts_at`).

**`group_events` feed query select:** Add `starts_at` to the existing `group_events` query select (currently selects `id, title, first_seen_at, group_id, groups(...)`).

**Entry mapping:** Set `eventDate: e.starts_at ?? undefined` when building event feed entries from `group_events`.

**Template — inline SVG, no emoji, guarded by eventType:**
```html
@if (item.eventType === 'event' && item.eventDate) {
  <div style="font-size:.72rem;color:rgba(255,214,10,.8);margin-bottom:3px;display:flex;align-items:center;gap:5px;">
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none"
         stroke="rgba(255,214,10,.8)" stroke-width="1.75"
         stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
    {{ formatEventDate(item.eventDate) }}
  </div>
}
```

**`formatEventDate` method on component** (same UTC+8 logic as the edge function):
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

## Test Scenarios

- `formatEventDate('2026-06-14T16:00:00.000Z')` → `6月15日（一）`  
  (UTC 16:00 = UTC+8 00:00 next day; Monday)
- `formatEventDate('2026-06-14T00:00:00.000Z')` → `6月14日（日）`  
  (UTC 00:00 = UTC+8 08:00 same day; Sunday)
- Feed `group_events` query includes `starts_at` in select
- Event feed entries render the date row; non-event entries (`song`, `member_change`, etc.) do not
- When `count > 1`, notification date matches the event with the earliest `starts_at`, not an arbitrary record

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/sync-group-events/index.ts` | Add `starts_at` to claim query select; track `nearestStartsAt`; add `formatEventDate`; update notification body (no emoji) |
| `src/app/pages/my-favorites/favorites-feed.component.ts` | Add `eventDate` to `FeedEntry`; add `starts_at` to `group_events` query; update template with inline SVG + `eventType` guard; add `formatEventDate` |

## Out of Scope

- Other notification types (birthday, status change, new song) — those already have contextual copy
- Events from member individual schedules (separate feature)
- Time display (e.g. 19:00) — event times in TimetTree are often TBD or all-day
