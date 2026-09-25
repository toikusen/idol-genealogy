-- Exclude search-engine crawlers from view counting and popularity rankings.
--
-- Googlebot renders JS, so it executes the client-side view tracker like a
-- real browser. Each crawl starts with empty localStorage (fresh token) and
-- rotates through a /19 of source IPs, so the 10-minute per-IP guard in
-- increment_view never catches it. Measured impact (2026-07-15): ~30% of all
-- "recent visitors" tokens were crawler traffic; some mid-rank members had
-- 5 of 8 votes from Googlebot alone.
--
-- Fix in two layers:
--   1. increment_view: drop crawler requests at the source, so page_views,
--      page_view_daily (trending board), and view_session_log all stay clean
--      going forward.
--   2. get_recent_popular_members/groups: also filter at query time, so the
--      crawler rows already inside the 7-day window stop counting immediately.
--
-- ponytail: fixed list of the three ranges observed in our logs (Googlebot,
-- Google other, Azure/Bingbot). Covers ~95% of what we see; add a range here
-- if a new crawler shows up in view_session_log. Not doing UA sniffing or
-- reverse-DNS verification — maintenance cost exceeds the damage.

create or replace function public.is_crawler_ip(p_ip inet)
returns boolean
language sql
immutable
set search_path to 'public'
as $function$
  select p_ip <<= any(array[
    inet '66.249.64.0/19',   -- Googlebot
    inet '72.14.192.0/18',   -- Google (other fetchers)
    inet '4.155.0.0/16'      -- Microsoft Azure / Bingbot
  ]);
$function$;

revoke all on function public.is_crawler_ip(inet) from public;

create or replace function public.increment_view(p_type text, p_id uuid, p_session_token uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_hdrs json := nullif(current_setting('request.headers', true), '')::json;
  v_ip   text := split_part(
                   coalesce(v_hdrs ->> 'cf-connecting-ip',
                            v_hdrs ->> 'x-forwarded-for', ''),
                   ',', 1);  -- first hop = real client
begin
  -- Search-engine crawlers are not visitors: don't record anything.
  if v_ip <> '' and is_crawler_ip(v_ip::inet) then
    return;
  end if;

  -- Same token already counted this entity within 10 minutes → skip.
  if exists (
    select 1 from view_session_log
    where session_token = p_session_token
      and entity_type   = p_type
      and entity_id     = p_id
      and viewed_at     > now() - interval '10 minutes'
  ) then
    return;
  end if;

  -- ponytail: same client IP already counted this entity within 10 minutes →
  -- skip. Kills the observed "many fresh tokens from one IP" burst. Widen the
  -- window (e.g. '1 day') if an attacker starts spacing requests out — but a
  -- longer window also collapses real users sharing one CGNAT IP (common on
  -- TW mobile). Skip the guard entirely when no IP is available.
  if v_ip <> '' and exists (
    select 1 from view_session_log
    where ip          = v_ip::inet
      and entity_type = p_type
      and entity_id   = p_id
      and viewed_at   > now() - interval '10 minutes'
  ) then
    return;
  end if;

  -- Record this session's view (upsert so the PK constraint holds on re-entry).
  insert into view_session_log (session_token, entity_type, entity_id, ip)
  values (p_session_token, p_type, p_id, nullif(v_ip, '')::inet)
  on conflict (session_token, entity_type, entity_id)
  do update set viewed_at = now(), ip = excluded.ip;

  -- Global view counter.
  insert into page_views (entity_type, entity_id, view_count)
  values (p_type, p_id, 1)
  on conflict (entity_type, entity_id)
  do update set view_count = page_views.view_count + 1;

  -- Daily rollup for the trending leaderboard (Taipei date).
  insert into page_view_daily (entity_type, entity_id, view_date, view_count)
  values (p_type, p_id, (now() at time zone 'Asia/Taipei')::date, 1)
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
  -- Rows without an IP predate migration 080; treat them as human.
  where vsl.ip is null or not is_crawler_ip(vsl.ip)
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
  where vsl.ip is null or not is_crawler_ip(vsl.ip)
  group by g.id, g.name, g.photo_url, g.color
  order by recent_visitors desc, g.id
  limit v_limit;
end;
$function$;
