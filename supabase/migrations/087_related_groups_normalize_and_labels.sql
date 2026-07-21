-- Two fixes to the related-groups recommendations shipped in 085. Measured
-- against production over a 20-group sample (2026-07-21):
--
--   1. Raw co-visit counts rank by popularity, not relatedness. A group that
--      everyone views co-occurs with everything, so the same handful of groups
--      surfaced everywhere: the most-recommended group appeared on 17 of 20
--      pages, and any two pages shared 43% of their 12 cards. That is the
--      trending board with extra steps.
--
--      Fix: score by cosine similarity — co_sessions over the geometric mean
--      of each group's own session count. A popular group now needs co-views
--      proportional to its reach to outrank a niche one. The >= 3 sessions
--      floor still uses the raw count, since that one is about sample size.
--
--   2. Every group filled all 12 slots from the co-visit tier alone, so tiers
--      2-4 were dead code for anything with traffic, and the "〇〇 也待過"
--      label — which only existed on tier 3 — never rendered once.
--
--      Fix: tiers still decide ranking, but the label is now looked up
--      independently, so a card that entered on co-visit still says which
--      member bridges the two groups.

-- ---------------------------------------------------------------------------
-- Co-visit matrix, normalized
-- ---------------------------------------------------------------------------

drop materialized view if exists group_covisit;

create materialized view group_covisit as
with recent as (
  select session_token, entity_id as gid
  from view_session_log
  where entity_type = 'group'
    and viewed_at > now() - interval '90 days'
),
totals as (
  select gid, count(*)::int as sessions
  from recent
  group by gid
),
pairs as (
  select a.gid as group_id, b.gid as related_id, count(*)::int as co_sessions
  from recent a
  join recent b on b.session_token = a.session_token and b.gid <> a.gid
  group by a.gid, b.gid
  having count(*) >= 3  -- below this it is noise, not a signal
)
select p.group_id,
       p.related_id,
       p.co_sessions,
       (p.co_sessions / sqrt(ta.sessions::numeric * tb.sessions))::real as score
from pairs p
join totals ta on ta.gid = p.group_id
join totals tb on tb.gid = p.related_id;

create unique index group_covisit_pkey on group_covisit (group_id, related_id);
create index group_covisit_lookup on group_covisit (group_id, score desc);

revoke all on group_covisit from anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_related_groups
-- ---------------------------------------------------------------------------
-- Dropped rather than replaced: score changes from int to real, and postgres
-- will not redefine a function's return type in place.

drop function if exists public.get_related_groups(uuid, int);

create function public.get_related_groups(p_group_id uuid, p_limit int default 12)
returns table (
  id           uuid,
  name         text,
  name_jp      text,
  photo_url    text,
  color        text,
  company_name text,
  reason       text,
  tier         int,
  score        real
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
  covisit as (
    select c.related_id as gid, 1 as tier, c.score
    from group_covisit c
    where c.group_id = p_group_id
  ),
  same_company as (
    select g.id as gid, 2 as tier, 0::real as score
    from groups g, self s
    where s.company_id is not null
      and g.company_id = s.company_id
      and g.id <> p_group_id
  ),
  lineage as (
    -- Doubles as the label source below, so it is built once. One member can
    -- bridge several groups; keep the earliest joiner per group so the label
    -- names a single person rather than an arbitrary one.
    select distinct on (h2.group_id)
           h2.group_id as gid,
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
    select g.id as gid, 4 as tier, 0::real as score
    from groups g, self s
    where s.founded_at is not null
      and g.founded_at is not null
      and g.id <> p_group_id
      and abs(extract(year from age(g.founded_at::date, s.founded_at::date))) <= 1
  ),
  candidates as (
    select * from covisit
    union all select * from same_company
    union all select l.gid, 3 as tier, 0::real as score from lineage l
    union all select * from era
  ),
  ranked as (
    -- A group can qualify through several tiers; show it once, ranked by the
    -- strongest.
    select distinct on (c.gid) c.gid, c.tier, c.score
    from candidates c
    order by c.gid, c.tier, c.score desc
  )
  select g.id, g.name, g.name_jp, g.photo_url, g.color,
         co.name as company_name,
         -- Label is independent of which tier got the card in: a co-visit card
         -- still names the shared member when there is one. Kept null for the
         -- other cases, where the text would only repeat the section heading
         -- or the agency line already on the card.
         l.reason,
         r.tier, r.score
  from ranked r
  join groups g on g.id = r.gid
  left join companies co on co.id = g.company_id
  left join lineage l on l.gid = r.gid
  where not g.is_trainee
  order by r.tier, r.score desc, g.founded_at desc nulls last
  limit v_limit;
end;
$function$;

revoke all on function public.get_related_groups(uuid, int) from public;
grant execute on function public.get_related_groups(uuid, int) to anon, authenticated;
