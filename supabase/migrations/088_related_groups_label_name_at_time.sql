-- Label the shared member with the name they used in the group being viewed,
-- not their current stage name.
--
-- The card sits on group A's page and reads "〇〇 也待過 [B]". The reader knows
-- this person by whatever they were called in A, so that is the name that makes
-- them recognisable — and recognition is the only reason the line exists.
--
-- Deliberately not the name used in B, even though the sentence is about B: a
-- member who was in B, C and D shows up on three cards of the same page, and
-- three different names for one person reads as three different people.
--
-- Falls back to the current name when the historical one was never recorded.

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
  lineage as (
    -- Doubles as the label source below, so it is built once. One member can
    -- bridge several groups; keep the earliest joiner per group so the label
    -- names a single person rather than an arbitrary one.
    select distinct on (h2.group_id)
           h2.group_id as gid,
           (coalesce(h1.name_at_time, m.name, m.name_roman) || ' 也待過')::text as reason
    from history h1
    join history h2 on h2.member_id = h1.member_id and h2.group_id <> p_group_id
    join members m  on m.id = h1.member_id
    where h1.group_id = p_group_id
      and h1.is_approved
      and h2.is_approved
      and h2.group_id is not null
      and coalesce(h1.name_at_time, m.name, m.name_roman) is not null
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
