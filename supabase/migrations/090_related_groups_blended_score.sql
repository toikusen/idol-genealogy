-- Rank by one blended score instead of strict tiers.
--
-- The tier system let co-visit decide the entire list: on i<3's page,
-- 溟海オシアナス — same agency, three shared members — ranked 14th and was cut
-- by the limit of 12, losing to a group with no relationship at all by 0.003.
--
-- That gap is noise. Co-visit scores across a whole result set span roughly
-- 0.35 down to 0.22, so below the top few the ordering is not measuring
-- anything, yet it was the only thing deciding who made the list. A shared
-- member contributed to the label only, never to whether the card appeared.
--
--   score = co-visit similarity
--         + 0.03 per shared member (capped at 5)
--         + 0.01 for the same agency
--
-- ponytail: the weights are a judgement call, not a fitted model — three
-- shared members is worth about the whole spread of the co-visit scores, which
-- matches how much more a shared lineage means on a genealogy site than a
-- co-view. They are two literals below; tune them, do not rebuild this.
--
-- `tier` is now informational only (which source first matched); ordering no
-- longer uses it. Kept in the signature so the client contract is unchanged.

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
    select c.related_id as gid, c.score
    from group_covisit c
    where c.group_id = p_group_id
  ),
  same_company as (
    select g.id as gid
    from groups g, self s
    where s.company_id is not null
      and g.company_id = s.company_id
      and g.id <> p_group_id
  ),
  bridges as (
    -- Members shared with each other group. name_at_time is the name used in
    -- the group being viewed, which is how the reader knows this person; the
    -- current stage name is only a fallback. A member with several stints in
    -- either group produces several rows, hence count(distinct).
    select h2.group_id as gid,
           count(distinct h1.member_id)::int as member_count,
           (array_agg(coalesce(h1.name_at_time, m.name, m.name_roman)
                      order by (h1.left_at is null) desc, h1.joined_at))[1] as rep_name
    from history h1
    join history h2 on h2.member_id = h1.member_id and h2.group_id <> p_group_id
    join members m  on m.id = h1.member_id
    where h1.group_id = p_group_id
      and h1.is_approved
      and h2.is_approved
      and h2.group_id is not null
      and coalesce(h1.name_at_time, m.name, m.name_roman) is not null
    group by h2.group_id
  ),
  era as (
    select g.id as gid
    from groups g, self s
    where s.founded_at is not null
      and g.founded_at is not null
      and g.id <> p_group_id
      and abs(extract(year from age(g.founded_at::date, s.founded_at::date))) <= 1
  ),
  candidates as (
    select gid from covisit
    union select gid from bridges
    union select gid from same_company
    union select gid from era
  ),
  scored as (
    select c.gid,
           (coalesce(cv.score, 0)
              + 0.03 * least(coalesce(b.member_count, 0), 5)
              + case when sc.gid is not null then 0.01 else 0 end)::real as score,
           case when cv.gid is not null then 1
                when sc.gid is not null then 2
                when b.gid  is not null then 3
                else 4
           end as tier,
           case when b.member_count = 1
                then b.rep_name || ' 也待過'
                when b.member_count > 1
                then b.rep_name || ' 等 ' || b.member_count || ' 人也待過'
           end as reason
    from candidates c
    left join covisit      cv on cv.gid = c.gid
    left join bridges      b  on b.gid  = c.gid
    left join same_company sc on sc.gid = c.gid
  )
  select g.id, g.name, g.name_jp, g.photo_url, g.color,
         co.name as company_name,
         -- Shown only where it says something the card does not already: the
         -- shared member. "同事務所" would repeat the agency line below the
         -- name, and "同期出道" is too vague to act on.
         s2.reason,
         s2.tier, s2.score
  from scored s2
  join groups g on g.id = s2.gid
  left join companies co on co.id = g.company_id
  where not g.is_trainee
  order by s2.score desc, g.founded_at desc nulls last
  limit v_limit;
end;
$function$;

revoke all on function public.get_related_groups(uuid, int) from public;
grant execute on function public.get_related_groups(uuid, int) to anon, authenticated;
