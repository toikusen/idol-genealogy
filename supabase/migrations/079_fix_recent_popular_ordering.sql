-- Add stable tiebreaker (m.id) to get_recent_popular_members and
-- get_recent_popular_groups so equal-visitor-count rows are ordered
-- consistently regardless of LIMIT, preventing homepage vs leaderboard
-- ranking divergence at tie boundaries.

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
  order by recent_visitors desc, m.id
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
  order by recent_visitors desc, g.id
  limit v_limit;
end;
$function$;
