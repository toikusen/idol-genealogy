-- Migration 035: Grant editors INSERT and UPDATE on core tables
-- Editors can create and modify records but cannot delete them.
-- All writes are captured automatically by database triggers into audit_log,
-- so admin can review and revert editor changes via the audit log.
-- All CREATE POLICY statements are preceded by DROP IF EXISTS for idempotency.

-- ── members ──────────────────────────────────────────────────────────────────
drop policy if exists "editors can insert members" on members;
create policy "editors can insert members" on members
  for insert with check (
    exists (select 1 from user_roles where email = auth.email() and role = 'editor')
  );
drop policy if exists "editors can update members" on members;
create policy "editors can update members" on members
  for update using (
    exists (select 1 from user_roles where email = auth.email() and role = 'editor')
  );

-- ── groups ───────────────────────────────────────────────────────────────────
drop policy if exists "editors can insert groups" on groups;
create policy "editors can insert groups" on groups
  for insert with check (
    exists (select 1 from user_roles where email = auth.email() and role = 'editor')
  );
drop policy if exists "editors can update groups" on groups;
create policy "editors can update groups" on groups
  for update using (
    exists (select 1 from user_roles where email = auth.email() and role = 'editor')
  );

-- ── teams ────────────────────────────────────────────────────────────────────
drop policy if exists "editors can insert teams" on teams;
create policy "editors can insert teams" on teams
  for insert with check (
    exists (select 1 from user_roles where email = auth.email() and role = 'editor')
  );
drop policy if exists "editors can update teams" on teams;
create policy "editors can update teams" on teams
  for update using (
    exists (select 1 from user_roles where email = auth.email() and role = 'editor')
  );

-- ── history ──────────────────────────────────────────────────────────────────
drop policy if exists "editors can insert history" on history;
create policy "editors can insert history" on history
  for insert with check (
    exists (select 1 from user_roles where email = auth.email() and role = 'editor')
  );
drop policy if exists "editors can update history" on history;
create policy "editors can update history" on history
  for update using (
    exists (select 1 from user_roles where email = auth.email() and role = 'editor')
  );

-- ── companies ────────────────────────────────────────────────────────────────
drop policy if exists "editors can insert companies" on companies;
create policy "editors can insert companies" on companies
  for insert with check (
    exists (select 1 from user_roles where email = auth.email() and role = 'editor')
  );
drop policy if exists "editors can update companies" on companies;
create policy "editors can update companies" on companies
  for update using (
    exists (select 1 from user_roles where email = auth.email() and role = 'editor')
  );

-- ── group_videos ─────────────────────────────────────────────────────────────
alter table group_videos enable row level security;

drop policy if exists "anyone can read group_videos" on group_videos;
create policy "anyone can read group_videos" on group_videos
  for select using (true);

drop policy if exists "admins can write group_videos" on group_videos;
create policy "admins can write group_videos" on group_videos
  for all using (
    exists (select 1 from user_roles where email = auth.email() and role in ('admin', 'superadmin'))
  )
  with check (
    exists (select 1 from user_roles where email = auth.email() and role in ('admin', 'superadmin'))
  );

drop policy if exists "editors can insert group_videos" on group_videos;
create policy "editors can insert group_videos" on group_videos
  for insert with check (
    exists (select 1 from user_roles where email = auth.email() and role = 'editor')
  );
drop policy if exists "editors can update group_videos" on group_videos;
create policy "editors can update group_videos" on group_videos
  for update using (
    exists (select 1 from user_roles where email = auth.email() and role = 'editor')
  );

-- ── group_songs ───────────────────────────────────────────────────────────────
-- This table was created outside the migration files (via Supabase dashboard).
-- Apply only if the table exists and RLS is already enabled on it.
drop policy if exists "editors can insert group_songs" on group_songs;
create policy "editors can insert group_songs" on group_songs
  for insert with check (
    exists (select 1 from user_roles where email = auth.email() and role = 'editor')
  );
drop policy if exists "editors can update group_songs" on group_songs;
create policy "editors can update group_songs" on group_songs
  for update using (
    exists (select 1 from user_roles where email = auth.email() and role = 'editor')
  );

-- ── member_songs ──────────────────────────────────────────────────────────────
-- Note: the app soft-deletes songs via UPDATE (is_deleted = true),
-- so editors can soft-delete songs through this UPDATE policy.
drop policy if exists "editors can insert member_songs" on member_songs;
create policy "editors can insert member_songs" on member_songs
  for insert with check (
    exists (select 1 from user_roles where email = auth.email() and role = 'editor')
  );
drop policy if exists "editors can update member_songs" on member_songs;
create policy "editors can update member_songs" on member_songs
  for update using (
    exists (select 1 from user_roles where email = auth.email() and role = 'editor')
  );
