-- Migration 069: Add notify_claimed_at to group_events for optimistic push claim locking.
-- The sync-group-events edge function uses this column to atomically claim events
-- before sending push notifications, preventing duplicate sends on concurrent runs.

alter table group_events
  add column if not exists notify_claimed_at timestamptz;

create index if not exists idx_group_events_notify_claimed
  on group_events (notify_claimed_at)
  where notify_claimed_at is not null;
