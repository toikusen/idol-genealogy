-- Recent-heat and trending leaderboard support.
--
-- increment_view's body below is a verbatim reconstruction of the live
-- production function (confirmed via `select pg_get_functiondef(oid) from
-- pg_proc where proname = 'increment_view'` on 2026-06-18) plus one new
-- insert into page_view_daily. It was not previously tracked in any
-- migration file. Do not change p_session_token's type (uuid) or the
-- security/search_path settings — they must match production exactly.

create table page_view_daily (
  entity_type text not null check (entity_type in ('member','group')),
  entity_id   uuid not null,
  view_date   date not null,
  view_count  bigint not null default 0,
  primary key (entity_type, entity_id, view_date)
);

create index idx_page_view_daily_lookup on page_view_daily (entity_type, view_date);

alter table page_view_daily enable row level security;

create policy page_view_daily_no_direct_access on page_view_daily
  for all using (false) with check (false);

-- Supports get_recent_popular_members/groups: filters by entity_type +
-- viewed_at range, then counts distinct session_token per entity_id.
create index idx_view_session_log_recent
  on view_session_log (entity_type, viewed_at, entity_id);

create or replace function public.increment_view(p_type text, p_id uuid, p_session_token uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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

  -- Increment today's daily rollup, used by the trending leaderboard.
  insert into page_view_daily (entity_type, entity_id, view_date, view_count)
  values (p_type, p_id, current_date, 1)
  on conflict (entity_type, entity_id, view_date)
  do update set view_count = page_view_daily.view_count + 1;
end;
$function$;

create or replace function public.get_recent_popular_members(p_limit int default 10, p_window_days int default 7)
returns table (
  id uuid,
  name text,
  name_roman text,
  photo_url text,
  color text,
  recent_visitors bigint
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_limit int := least(greatest(coalesce(p_limit, 10), 1), 50);
  v_window_days int := least(greatest(coalesce(p_window_days, 7), 1), 30);
begin
  return query
  select m.id, m.name, m.name_roman, m.photo_url, m.color,
         count(distinct vsl.session_token) as recent_visitors
  from members m
  join view_session_log vsl
    on vsl.entity_type = 'member'
    and vsl.entity_id = m.id
    and vsl.viewed_at >= now() - (v_window_days || ' days')::interval
  group by m.id, m.name, m.name_roman, m.photo_url, m.color
  order by recent_visitors desc
  limit v_limit;
end;
$function$;

create or replace function public.get_recent_popular_groups(p_limit int default 10, p_window_days int default 7)
returns table (
  id uuid,
  name text,
  photo_url text,
  color text,
  recent_visitors bigint
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_limit int := least(greatest(coalesce(p_limit, 10), 1), 50);
  v_window_days int := least(greatest(coalesce(p_window_days, 7), 1), 30);
begin
  return query
  select g.id, g.name, g.photo_url, g.color,
         count(distinct vsl.session_token) as recent_visitors
  from groups g
  join view_session_log vsl
    on vsl.entity_type = 'group'
    and vsl.entity_id = g.id
    and vsl.viewed_at >= now() - (v_window_days || ' days')::interval
  group by g.id, g.name, g.photo_url, g.color
  order by recent_visitors desc
  limit v_limit;
end;
$function$;

create or replace function public.get_trending_members(p_limit int default 10)
returns table (
  id uuid,
  name text,
  name_roman text,
  photo_url text,
  color text,
  recent_view_count bigint,
  trend_delta bigint
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_limit int := least(greatest(coalesce(p_limit, 10), 1), 50);
begin
  return query
  with recent as (
    select entity_id, sum(view_count) as v
    from page_view_daily
    where entity_type = 'member'
      and view_date >= current_date - 7
      and view_date <  current_date
    group by entity_id
  ),
  previous as (
    select entity_id, sum(view_count) as v
    from page_view_daily
    where entity_type = 'member'
      and view_date >= current_date - 14
      and view_date <  current_date - 7
    group by entity_id
  )
  select m.id, m.name, m.name_roman, m.photo_url, m.color,
         coalesce(r.v, 0) as recent_view_count,
         coalesce(r.v, 0) - coalesce(p.v, 0) as trend_delta
  from members m
  join recent r on r.entity_id = m.id
  left join previous p on p.entity_id = m.id
  order by trend_delta desc
  limit v_limit;
end;
$function$;

create or replace function public.get_trending_groups(p_limit int default 10)
returns table (
  id uuid,
  name text,
  photo_url text,
  color text,
  recent_view_count bigint,
  trend_delta bigint
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_limit int := least(greatest(coalesce(p_limit, 10), 1), 50);
begin
  return query
  with recent as (
    select entity_id, sum(view_count) as v
    from page_view_daily
    where entity_type = 'group'
      and view_date >= current_date - 7
      and view_date <  current_date
    group by entity_id
  ),
  previous as (
    select entity_id, sum(view_count) as v
    from page_view_daily
    where entity_type = 'group'
      and view_date >= current_date - 14
      and view_date <  current_date - 7
    group by entity_id
  )
  select g.id, g.name, g.photo_url, g.color,
         coalesce(r.v, 0) as recent_view_count,
         coalesce(r.v, 0) - coalesce(p.v, 0) as trend_delta
  from groups g
  join recent r on r.entity_id = g.id
  left join previous p on p.entity_id = g.id
  order by trend_delta desc
  limit v_limit;
end;
$function$;

revoke all on function public.get_recent_popular_members(int, int) from public;
grant execute on function public.get_recent_popular_members(int, int) to anon, authenticated;

revoke all on function public.get_recent_popular_groups(int, int) from public;
grant execute on function public.get_recent_popular_groups(int, int) to anon, authenticated;

revoke all on function public.get_trending_members(int) from public;
grant execute on function public.get_trending_members(int) to anon, authenticated;

revoke all on function public.get_trending_groups(int) from public;
grant execute on function public.get_trending_groups(int) to anon, authenticated;
