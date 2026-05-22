-- Migration 058: Backfill notified_at for all existing group_events to prevent
-- mass push notification on first cron run after feature launch.
-- Only events with first_seen_at AFTER this migration runs should be pushed.

update group_events
set notified_at = now()
where notified_at is null;
