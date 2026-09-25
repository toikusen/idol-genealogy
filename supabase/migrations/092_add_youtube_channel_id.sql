-- Add groups.youtube_channel_id, the resolved UC... ID for the group's channel.
--
-- groups.youtube stores mostly bare @handles, but the YouTube RSS feed only
-- accepts a UC... channel ID. Resolving on every page view would mean an extra
-- channel-page fetch per cache miss, so the ID is resolved once (on save in
-- admin-groups, or by scripts/backfill-youtube-channel-ids.mjs) and stored.
--
-- Null means "not resolved" — the group page then renders no video section,
-- which is the same as a group with no videos today.
--
-- Phase A of two. Phase B drops group_videos, and only runs once this column is
-- backfilled and the new video section is confirmed working in production.

alter table groups
  add column if not exists youtube_channel_id text;

-- Partial index: the backfill script and the admin gap-fill both look for rows
-- that have a channel but no resolved ID.
create index if not exists groups_youtube_unresolved_idx
  on groups (id)
  where youtube is not null and youtube_channel_id is null;
