-- Add choreographer (編舞) to song credits, alongside lyricist/composer/arranger.
--
-- Null means "unknown / not credited", same as the other three credit columns.
-- The audit and proposal triggers snapshot whole rows as jsonb, so they pick the
-- new column up with no change.

alter table member_songs
  add column if not exists choreographer text;

alter table group_songs
  add column if not exists choreographer text;
