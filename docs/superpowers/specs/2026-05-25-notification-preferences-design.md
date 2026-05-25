# Notification Preferences Design

**Date:** 2026-05-25
**Branch:** feat/pwa-my-favorites

## Overview

Allow users to choose which push notification types they want to receive. Currently the system is all-or-nothing: subscribing to push notifications means receiving all 5 notification types. This design adds per-type preferences so users can, for example, receive event and birthday notifications but not status change notifications.

## Scope

Global preferences per user — one set of toggles that applies across all favorited groups and members. Per-entity preferences (e.g., different settings for each group) are out of scope.

## Notification Types

| Type | Edge Function | Trigger |
|------|--------------|---------|
| 活動通知 | `sync-group-events` | New event added to a favorited group |
| 新增歌曲 | `notify-new-song` | New song added for a favorited group or member |
| 狀態異動 | `notify-status-change` | Member status changes (graduated, withdrawn, hiatus, active) |
| 生日提醒 | `notify-birthdays` | Favorited member's birthday (daily cron) |
| 解散公告 | `notify-group-disbanded` | Favorited group publishes disbandment date |

## Data Model

### New table: `push_notification_prefs`

```sql
create table push_notification_prefs (
  user_id             uuid primary key references auth.users on delete cascade,
  notify_event        boolean not null default true,
  notify_new_song     boolean not null default true,
  notify_status       boolean not null default true,
  notify_birthday     boolean not null default true,
  notify_disbanded    boolean not null default true,
  updated_at          timestamptz not null default now()
);
```

- Primary key on `user_id` — one row per user, not per device
- All columns default `true` — users who never visit settings receive everything (no behaviour change)
- Independent of `push_subscriptions` — preferences persist even when push is unsubscribed
- `updated_at`: frontend `savePrefs()` must explicitly pass `updated_at: new Date().toISOString()` on every upsert — the column default only fires on INSERT, not on subsequent updates

### RLS

```sql
alter table push_notification_prefs enable row level security;

create policy "users can manage own notification prefs"
  on push_notification_prefs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

The `for all` policy covers SELECT, INSERT, and UPDATE — required because the frontend uses `upsert`.

## Backend Changes

Each of the 5 Edge Functions must filter out users who have disabled that notification type before calling `send-push-notification`.

Pattern (same for all functions):

```ts
// After collecting userIds from user_favorites:
const { data: prefs, error: prefsError } = await supabase
  .from('push_notification_prefs')
  .select('user_id')
  .in('user_id', userIds)
  .eq('notify_event', false);  // column name varies per function

// Fail-open: if prefs query fails, send to everyone (preserves existing behaviour)
const optedOut = prefsError ? new Set<string>() : new Set((prefs ?? []).map(p => p.user_id));
const filteredIds = userIds.filter(id => !optedOut.has(id));

if (filteredIds.length === 0) return new Response('all opted out', { status: 200 });

// Replace userIds with filteredIds in the send-push-notification call:
// body: JSON.stringify({ user_ids: filteredIds, notification: { ... } })
```

The logic is "exclude opted-out users" rather than "include opted-in users" — users with no preference row (new users) still receive all notifications by default. Fail-open on prefs query error ensures a Supabase outage does not silently drop notifications.

## Frontend Changes

### `push-settings.component.ts`

The existing component handles push subscription state. Extend it to:

1. **Load preferences** on init — `SELECT * FROM push_notification_prefs WHERE user_id = ?`; if no row, treat all as `true`
2. **Save on toggle** — upsert the row immediately when any toggle changes (no save button)
3. **Dim + hint when push is off** — when `permission !== 'granted'`, render all 5 preference rows with reduced opacity and show the hint text "開啟推播通知後，以上設定才會生效。" Toggles remain interactive so users can pre-configure before enabling push.

### UI Layout (approved)

```
┌─────────────────────────────────────────┐
│ 推播通知              ● 已開啟 / 開啟通知 │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ 選擇要接收的通知類型                       │
│                                         │
│ [calendar] 活動通知       ┌──┐           │
│   演唱會、見面會等新活動   │● │           │
│                           └──┘           │
│ [music]    新增歌曲        ┌──┐           │
│   發布新歌或 MV           │● │           │
│                           └──┘           │
│ [refresh]  狀態異動        ┌──┐           │
│   畢業、退出、休息、復歸    │  │ (off)    │
│                           └──┘           │
│ [gift]     生日提醒        ┌──┐           │
│   最愛成員的生日當天       │● │           │
│                           └──┘           │
│ [users-x]  解散公告        ┌──┐           │
│   最愛的團體發布解散消息    │● │           │
│                          └──┘           │
│                                         │
│ ⓘ 開啟推播通知後，以上設定才會生效。      │
│   (only shown when push is off)         │
└─────────────────────────────────────────┘
```

Icons: inline SVG line icons (no emoji, no colored backgrounds)
- 活動通知: calendar rectangle
- 新增歌曲: music note
- 狀態異動: rotating arrows
- 生日提醒: gift box
- 解散公告: two person silhouettes with slash

## Implementation Checklist

1. **Migration** — `059_add_push_notification_prefs.sql`: create `push_notification_prefs` table with RLS
2. **Edge Functions** — add preference filter to all 5 notify functions
3. **Frontend service** — add `loadPrefs()` and `savePrefs()` methods (can live in `PushNotificationService` or a new `NotificationPrefsService`)
4. **`push-settings.component.ts`** — add 5 toggle rows with icons, load/save logic, dim state

## Out of Scope

- Per-entity preferences (e.g., only events for one specific group)
- Quiet hours / do-not-disturb scheduling
- Notification history
