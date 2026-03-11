-- supabase/migrations/002_roles_and_audit.sql
-- Apply manually in Supabase Dashboard SQL Editor

-- ============================================================
-- 1. user_roles table
-- ============================================================
create table user_roles (
  id         uuid primary key default gen_random_uuid(),
  email      text unique not null,
  role       text not null check (role in ('admin', 'editor')),
  created_at timestamptz default now()
);

-- ============================================================
-- 2. audit_log table
-- ============================================================
create table audit_log (
  id          uuid primary key default gen_random_uuid(),
  table_name  text not null,
  record_id   uuid not null,
  operation   text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  user_id     uuid,       -- NULL if no JWT context (should not happen from frontend)
  user_email  text,
  old_data    jsonb,      -- NULL for INSERT
  new_data    jsonb,      -- NULL for DELETE
  created_at  timestamptz default now()
);

-- Index for filtered queries + sort
create index on audit_log (table_name, operation, created_at desc);

-- ============================================================
-- 3. Trigger function (shared across all 4 tables)
-- SECURITY DEFINER lets it bypass RLS to write to audit_log.
-- auth.uid() / auth.email() are session GUCs set by PostgREST
-- from the JWT — available even in SECURITY DEFINER context.
-- ============================================================
create or replace function log_changes()
returns trigger as $$
begin
  insert into audit_log (table_name, record_id, operation, user_id, user_email, old_data, new_data)
  values (
    tg_table_name,
    coalesce(new.id, old.id),
    tg_op,
    auth.uid(),
    auth.email(),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return null; -- AFTER trigger: return value is ignored
end;
$$ language plpgsql security definer;

-- ============================================================
-- 4. Attach triggers to all 4 tables
-- ============================================================
create trigger members_audit
  after insert or update or delete on members
  for each row execute function log_changes();

create trigger groups_audit
  after insert or update or delete on groups
  for each row execute function log_changes();

create trigger teams_audit
  after insert or update or delete on teams
  for each row execute function log_changes();

create trigger history_audit
  after insert or update or delete on history
  for each row execute function log_changes();

-- ============================================================
-- 5. RLS on new tables
-- ============================================================
alter table user_roles enable row level security;
alter table audit_log enable row level security;

-- Admin check helper (used in all admin-only policies below):
-- EXISTS (SELECT 1 FROM user_roles WHERE email = auth.email() AND role = 'admin')

-- user_roles: admin only (all operations)
create policy "admins can read user_roles" on user_roles
  for select using (
    exists (select 1 from user_roles where email = auth.email() and role = 'admin')
  );
create policy "admins can insert user_roles" on user_roles
  for insert with check (
    exists (select 1 from user_roles where email = auth.email() and role = 'admin')
  );
create policy "admins can update user_roles" on user_roles
  for update using (
    exists (select 1 from user_roles where email = auth.email() and role = 'admin')
  )
  with check (
    exists (select 1 from user_roles where email = auth.email() and role = 'admin')
  );
create policy "admins can delete user_roles" on user_roles
  for delete using (
    exists (select 1 from user_roles where email = auth.email() and role = 'admin')
  );

-- audit_log: admin read only; no INSERT/UPDATE/DELETE policies
-- (trigger writes via SECURITY DEFINER, bypassing RLS entirely)
create policy "admins can read audit_log" on audit_log
  for select using (
    exists (select 1 from user_roles where email = auth.email() and role = 'admin')
  );

-- ============================================================
-- 6. Update DELETE policies on existing tables
-- Drop old permissive policies, add admin-only replacements
-- ============================================================
drop policy "auth users can delete members" on members;
drop policy "auth users can delete groups" on groups;
drop policy "auth users can delete teams" on teams;
drop policy "auth users can delete history" on history;

create policy "admins can delete members" on members
  for delete using (
    exists (select 1 from user_roles where email = auth.email() and role = 'admin')
  );
create policy "admins can delete groups" on groups
  for delete using (
    exists (select 1 from user_roles where email = auth.email() and role = 'admin')
  );
create policy "admins can delete teams" on teams
  for delete using (
    exists (select 1 from user_roles where email = auth.email() and role = 'admin')
  );
create policy "admins can delete history" on history
  for delete using (
    exists (select 1 from user_roles where email = auth.email() and role = 'admin')
  );
