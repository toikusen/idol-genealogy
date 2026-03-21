-- supabase/migrations/033_view_session_cooldown.sql
-- Apply manually in Supabase Dashboard SQL Editor

-- Track per-session cooldowns (one row per session+entity, upserted on each real view)
create table view_session_log (
  session_token uuid        not null,
  entity_type   text        not null,
  entity_id     uuid        not null,
  viewed_at     timestamptz not null default now(),
  primary key (session_token, entity_type, entity_id)
);

-- All reads/writes go through the SECURITY DEFINER RPC below, so no client policies needed.
alter table view_session_log enable row level security;

-- Drop the old two-argument overload so callers cannot bypass the session token check.
drop function if exists increment_view(text, uuid);

-- New three-argument increment_view with session cooldown
create or replace function increment_view(
  p_type          text,
  p_id            uuid,
  p_session_token uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- If the same session already counted this entity within 10 minutes, do nothing.
  if exists (
    select 1 from view_session_log
    where session_token = p_session_token
      and entity_type   = p_type
      and entity_id     = p_id
      and viewed_at     > now() - interval '10 minutes'
  ) then
    return;
  end if;

  -- Record this session's view (upsert so the primary key constraint is satisfied on re-entry after cooldown)
  insert into view_session_log (session_token, entity_type, entity_id)
  values (p_session_token, p_type, p_id)
  on conflict (session_token, entity_type, entity_id)
  do update set viewed_at = now();

  -- Increment the global view counter
  insert into page_views (entity_type, entity_id, view_count)
  values (p_type, p_id, 1)
  on conflict (entity_type, entity_id)
  do update set view_count = page_views.view_count + 1;
end;
$$;

grant execute on function increment_view(text, uuid, uuid) to anon;
