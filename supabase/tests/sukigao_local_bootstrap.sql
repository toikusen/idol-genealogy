-- Minimal stand-in for the production schema, for running
-- 106_sukigao.test.sql against a throwaway local Postgres
-- (scripts/test-sukigao-sql.sh). NOT a migration.
--
-- Mirrors what matters to migration 106: Supabase's anon/authenticated roles,
-- its default privileges (new tables/functions are granted to both roles, so
-- the migration's REVOKEs are what actually lock the tables), and the columns
-- of members / groups / history that the RPCs read.

do $$ begin
  create role anon nologin;
exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null; end $$;

grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;

create table if not exists members (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  name_roman  text,
  nickname    text,
  photo_url   text,
  color       text,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create table if not exists groups (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  disbanded_at date
);

create table if not exists history (
  id                  uuid primary key default gen_random_uuid(),
  member_id           uuid not null references members(id) on delete cascade,
  group_id            uuid references groups(id),
  status              text,
  joined_at           date,
  left_at             date,
  external_group_name text,
  external_country    text,
  is_approved         boolean not null default true
);

-- Public read, as in production.
alter table members enable row level security;
alter table groups  enable row level security;
alter table history enable row level security;
drop policy if exists public_read on members;
drop policy if exists public_read on groups;
drop policy if exists public_read on history;
create policy public_read on members for select using (true);
create policy public_read on groups  for select using (true);
create policy public_read on history for select using (true);
