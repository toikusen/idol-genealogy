-- Say how many members bridge the two groups, not just one of them.
--
-- Measured on production (2026-07-21): of the 382 group pairs that share at
-- least one member, 31% share two or more, and one pair shares six. Those are
-- precisely the strongest links, and the label was throwing that away by
-- naming a single arbitrary member.
--
--   1 shared member  ->  小美 也待過
--   3 shared members ->  小美 等 3 人也待過
--
-- Names are not listed in full: the line is nowrap-ellipsised on a card that
-- is half the viewport wide, and the count carries the signal anyway.
--
-- The representative is now the member most likely to be recognised — still in
-- the group being viewed, longest-serving first — rather than whoever happened
-- to join the other group earliest.

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
  lineage as (
    select b.gid,
           case when b.member_count = 1
                then b.rep_name || ' 也待過'
                else b.rep_name || ' 等 ' || b.member_count || ' 人也待過'
           end as reason
    from bridges b
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
         -- still names the shared members when there are any. Kept null for the
         -- other cases, where the text would only repeat the section heading or
         -- the agency line already on the card.
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
