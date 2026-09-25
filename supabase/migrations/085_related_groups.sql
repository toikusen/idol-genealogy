-- "其他人也看了" without a hand-maintained style field.
--
-- The old implementation matched groups.style with `like %x%`, so a group with
-- an empty style column silently showed nothing — and style is easy to forget
-- when adding a group. Everything below is derived from data that is either
-- collected automatically (view_session_log) or that an editor cannot skip
-- without the group being unusable anyway (company, member history, founded_at).
--
-- Ranked in tiers, best first:
--   1 co-visit  — sessions that viewed this group also viewed that one
--   2 company   — same agency
--   3 lineage   — a member who was in both groups
--   4 era       — debuted within a year of each other
--
-- Disbanded groups are deliberately included: "where did the members go after
-- the group broke up" is the path people actually follow on a genealogy site.

-- ---------------------------------------------------------------------------
-- Co-visit matrix
-- ---------------------------------------------------------------------------
-- view_session_log's primary key is (session_token, entity_type, entity_id),
-- so one session contributes at most one row per group and the count below is
-- already a distinct-session count.
--
-- ponytail: a materialized view refreshed on a schedule, not a live join.
-- Recommendations built from a 90-day window do not change meaningfully within
-- a day, and the live self-join costs a sequential scan per page view.

drop materialized view if exists group_covisit;

create materialized view group_covisit as
select a.entity_id as group_id,
       b.entity_id as related_id,
       count(*)::int as score
from view_session_log a
join view_session_log b
  on b.session_token = a.session_token
 and b.entity_type   = 'group'
 and b.entity_id    <> a.entity_id
 and b.viewed_at      > now() - interval '90 days'
where a.entity_type = 'group'
  and a.viewed_at   > now() - interval '90 days'
group by a.entity_id, b.entity_id
having count(*) >= 3;  -- below this it is noise, not a signal

-- Unique index is what makes REFRESH ... CONCURRENTLY legal.
create unique index group_covisit_pkey on group_covisit (group_id, related_id);
create index group_covisit_lookup on group_covisit (group_id, score desc);

-- Not readable by clients: get_related_groups is security definer and reads it
-- on their behalf. No RLS on matviews, so no grant is the access control.
revoke all on group_covisit from anon, authenticated;

create or replace function public.refresh_group_covisit()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  refresh materialized view concurrently group_covisit;
end;
$function$;

revoke all on function public.refresh_group_covisit() from public;

-- 19:30 UTC = 03:30 Asia/Taipei, just after the nightly Pages rebuild.
-- ponytail: pg_cron instead of a CI step, so this needs no new secret. If the
-- extension is unavailable the migration still applies and the matview simply
-- keeps its last contents until someone calls refresh_group_covisit().
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('refresh-group-covisit', '30 19 * * *', 'select refresh_group_covisit()');
exception when others then
  raise notice 'pg_cron unavailable (%) — schedule refresh_group_covisit() by other means', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- get_related_groups
-- ---------------------------------------------------------------------------

create or replace function public.get_related_groups(p_group_id uuid, p_limit int default 12)
returns table (
  id           uuid,
  name         text,
  name_jp      text,
  photo_url    text,
  color        text,
  company_name text,
  reason       text,
  tier         int,
  score        int
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_limit int := least(greatest(coalesce(p_limit, 12), 1), 24);
begin
  return query
  with self as (
    select g.company_id, g.founded_at from groups g where g.id = p_group_id
  ),
  -- reason is null wherever the label would carry no information the card is
  -- not already showing: "很多人也看了" repeats the section heading verbatim,
  -- "同事務所" repeats the agency line, "同期出道" is too vague to act on.
  -- Only the member bridge below says something the reader cannot see.
  covisit as (
    select c.related_id as gid, 1 as tier, c.score, null::text as reason
    from group_covisit c
    where c.group_id = p_group_id
  ),
  same_company as (
    select g.id as gid, 2 as tier, 0 as score, null::text as reason
    from groups g, self s
    where s.company_id is not null
      and g.company_id = s.company_id
      and g.id <> p_group_id
  ),
  lineage as (
    -- One member can bridge several groups; keep the strongest bridge per group
    -- so the reason names a single person instead of an arbitrary one.
    select distinct on (h2.group_id)
           h2.group_id as gid, 3 as tier, 0 as score,
           (coalesce(m.name, m.name_roman) || ' 也待過')::text as reason
    from history h1
    join history h2 on h2.member_id = h1.member_id and h2.group_id <> p_group_id
    join members m  on m.id = h1.member_id
    where h1.group_id = p_group_id
      and h1.is_approved
      and h2.is_approved
      and h2.group_id is not null
      and coalesce(m.name, m.name_roman) is not null
    order by h2.group_id, h2.joined_at
  ),
  era as (
    select g.id as gid, 4 as tier, 0 as score, null::text as reason
    from groups g, self s
    where s.founded_at is not null
      and g.founded_at is not null
      and g.id <> p_group_id
      and abs(extract(year from age(g.founded_at::date, s.founded_at::date))) <= 1
  ),
  candidates as (
    select * from covisit
    union all select * from same_company
    union all select * from lineage
    union all select * from era
  ),
  ranked as (
    -- Same group can qualify through several tiers; show it once, with the
    -- strongest reason.
    select distinct on (c.gid) c.gid, c.tier, c.score, c.reason
    from candidates c
    order by c.gid, c.tier, c.score desc
  )
  select g.id, g.name, g.name_jp, g.photo_url, g.color,
         co.name as company_name,
         r.reason, r.tier, r.score
  from ranked r
  join groups g on g.id = r.gid
  left join companies co on co.id = g.company_id
  where not g.is_trainee
  order by r.tier, r.score desc, g.founded_at desc nulls last
  limit v_limit;
end;
$function$;

revoke all on function public.get_related_groups(uuid, int) from public;
grant execute on function public.get_related_groups(uuid, int) to anon, authenticated;
