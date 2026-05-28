-- Migration 058: Historical placeholder for initial group_events backfill.
--
-- This file was missing from the repository even though later migrations refer to
-- the PWA schema. Keep it non-destructive: applying it to an existing production
-- database after the feature has been live must not mark currently pending events
-- as already notified.

update group_events
set notified_at = now()
where false;
