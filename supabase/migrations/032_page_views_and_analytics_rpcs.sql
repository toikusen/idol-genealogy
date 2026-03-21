-- supabase/migrations/032_page_views_and_analytics_rpcs.sql
-- Apply manually in Supabase Dashboard SQL Editor

-- page_views table
create table page_views (
  entity_type  text not null check (entity_type in ('member', 'group')),
  entity_id    uuid not null,
  view_count   bigint not null default 0,
  primary key (entity_type, entity_id)
);

alter table page_views enable row level security;
create policy "anyone can read page_views" on page_views for select using (true);

-- increment_view RPC (security definer so anon can write without table-level INSERT policy)
create or replace function increment_view(p_type text, p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into page_views (entity_type, entity_id, view_count)
  values (p_type, p_id, 1)
  on conflict (entity_type, entity_id)
  do update set view_count = page_views.view_count + 1;
$$;

grant execute on function increment_view(text, uuid) to anon;

-- get_top_members_by_views RPC
-- INNER JOIN is intentional: only members with at least one view appear in the leaderboard.
-- coalesce is present for clarity but has no effect with INNER JOIN (pv.view_count is always non-null).
create or replace function get_top_members_by_views(p_limit int)
returns table (id uuid, name text, name_roman text, photo_url text, color text, view_count bigint)
language sql stable security invoker as $$
  select m.id, m.name, m.name_roman, m.photo_url, m.color, coalesce(pv.view_count, 0)
  from members m
  join page_views pv on pv.entity_id = m.id and pv.entity_type = 'member'
  order by pv.view_count desc
  limit p_limit;
$$;

-- get_top_groups_by_views RPC
-- Same INNER JOIN intent as above.
create or replace function get_top_groups_by_views(p_limit int)
returns table (id uuid, name text, photo_url text, color text, view_count bigint)
language sql stable security invoker as $$
  select g.id, g.name, g.photo_url, g.color, coalesce(pv.view_count, 0)
  from groups g
  join page_views pv on pv.entity_id = g.id and pv.entity_type = 'group'
  order by pv.view_count desc
  limit p_limit;
$$;

grant execute on function get_top_members_by_views(int) to anon;
grant execute on function get_top_groups_by_views(int) to anon;
