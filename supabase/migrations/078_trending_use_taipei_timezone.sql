-- Use Asia/Taipei for date boundaries so the trending window rolls over at
-- Taiwan midnight (00:00 CST) instead of UTC midnight (08:00 CST).

create or replace function public.increment_view(p_type text, p_id uuid, p_session_token uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if exists (
    select 1 from view_session_log
    where session_token = p_session_token
      and entity_type   = p_type
      and entity_id     = p_id
      and viewed_at     > now() - interval '10 minutes'
  ) then
    return;
  end if;

  insert into view_session_log (session_token, entity_type, entity_id)
  values (p_session_token, p_type, p_id)
  on conflict (session_token, entity_type, entity_id)
  do update set viewed_at = now();

  insert into page_views (entity_type, entity_id, view_count)
  values (p_type, p_id, 1)
  on conflict (entity_type, entity_id)
  do update set view_count = page_views.view_count + 1;

  -- Use Taipei date so daily rollup aligns with Taiwan midnight.
  insert into page_view_daily (entity_type, entity_id, view_date, view_count)
  values (p_type, p_id, (now() at time zone 'Asia/Taipei')::date, 1)
  on conflict (entity_type, entity_id, view_date)
  do update set view_count = page_view_daily.view_count + 1;
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
  v_today date := (now() at time zone 'Asia/Taipei')::date;
begin
  return query
  with recent as (
    select entity_id, sum(view_count)::bigint as v
    from page_view_daily
    where entity_type = 'member'
      and view_date >= v_today - 7
      and view_date <  v_today
    group by entity_id
  ),
  previous as (
    select entity_id, sum(view_count)::bigint as v
    from page_view_daily
    where entity_type = 'member'
      and view_date >= v_today - 14
      and view_date <  v_today - 7
    group by entity_id
  )
  select m.id, m.name, m.name_roman, m.photo_url, m.color,
         coalesce(r.v, 0) as recent_view_count,
         coalesce(r.v, 0) - coalesce(p.v, 0) as trend_delta
  from members m
  join recent r on r.entity_id = m.id
  left join previous p on p.entity_id = m.id
  where coalesce(r.v, 0) - coalesce(p.v, 0) > 0
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
  v_today date := (now() at time zone 'Asia/Taipei')::date;
begin
  return query
  with recent as (
    select entity_id, sum(view_count)::bigint as v
    from page_view_daily
    where entity_type = 'group'
      and view_date >= v_today - 7
      and view_date <  v_today
    group by entity_id
  ),
  previous as (
    select entity_id, sum(view_count)::bigint as v
    from page_view_daily
    where entity_type = 'group'
      and view_date >= v_today - 14
      and view_date <  v_today - 7
    group by entity_id
  )
  select g.id, g.name, g.photo_url, g.color,
         coalesce(r.v, 0) as recent_view_count,
         coalesce(r.v, 0) - coalesce(p.v, 0) as trend_delta
  from groups g
  join recent r on r.entity_id = g.id
  left join previous p on p.entity_id = g.id
  where coalesce(r.v, 0) - coalesce(p.v, 0) > 0
  order by trend_delta desc
  limit v_limit;
end;
$function$;
