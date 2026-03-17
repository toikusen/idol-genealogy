-- Migration 027: Restrict INSERT and UPDATE on core tables to admin-only
-- Previously these were open to any authenticated user, allowing direct DB writes
-- that bypassed the proposal system. This aligns INSERT/UPDATE with the existing
-- admin-only DELETE policies from migration 002.

-- ── members ──────────────────────────────────────────────────────────────────
drop policy if exists "auth users can insert members" on members;
drop policy if exists "auth users can update members" on members;

create policy "admins can insert members" on members
  for insert with check (
    exists (select 1 from user_roles where email = auth.email() and role = 'admin')
  );
create policy "admins can update members" on members
  for update using (
    exists (select 1 from user_roles where email = auth.email() and role = 'admin')
  );

-- ── groups ───────────────────────────────────────────────────────────────────
drop policy if exists "auth users can insert groups" on groups;
drop policy if exists "auth users can update groups" on groups;

create policy "admins can insert groups" on groups
  for insert with check (
    exists (select 1 from user_roles where email = auth.email() and role = 'admin')
  );
create policy "admins can update groups" on groups
  for update using (
    exists (select 1 from user_roles where email = auth.email() and role = 'admin')
  );

-- ── teams ────────────────────────────────────────────────────────────────────
drop policy if exists "auth users can insert teams" on teams;
drop policy if exists "auth users can update teams" on teams;

create policy "admins can insert teams" on teams
  for insert with check (
    exists (select 1 from user_roles where email = auth.email() and role = 'admin')
  );
create policy "admins can update teams" on teams
  for update using (
    exists (select 1 from user_roles where email = auth.email() and role = 'admin')
  );

-- ── history ──────────────────────────────────────────────────────────────────
drop policy if exists "auth users can insert history" on history;
drop policy if exists "auth users can update history" on history;

create policy "admins can insert history" on history
  for insert with check (
    exists (select 1 from user_roles where email = auth.email() and role = 'admin')
  );
create policy "admins can update history" on history
  for update using (
    exists (select 1 from user_roles where email = auth.email() and role = 'admin')
  );

-- ── companies ────────────────────────────────────────────────────────────────
-- (companies table was added later; check if these policies exist first)
drop policy if exists "auth users can insert companies" on companies;
drop policy if exists "auth users can update companies" on companies;

create policy "admins can insert companies" on companies
  for insert with check (
    exists (select 1 from user_roles where email = auth.email() and role = 'admin')
  );
create policy "admins can update companies" on companies
  for update using (
    exists (select 1 from user_roles where email = auth.email() and role = 'admin')
  );
