-- Migration 107: 顏控9選 — every member with a photo is a candidate.
--
-- 106 limited the pool to current members. It now includes graduated /
-- withdrawn / disbanded-group members too; only members without a photo are
-- left out. group_names, in order of preference:
--   1. current Taiwan groups (same "current" rule as 106);
--   2. '{}' for a current solo career (the UI shows "Solo");
--   3. the most recent group — Taiwan group name, or an overseas group's
--      external_group_name;
--   4. '{}' when there is no history at all.
-- Same signature and columns as 106, so CREATE OR REPLACE is enough.
create or replace function public.get_sukigao_candidates()
returns table (
  id          uuid,
  name        text,
  name_roman  text,
  nickname    text,
  photo_url   text,
  color       text,
  group_names text[],
  updated_at  timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  with today as (
    select (now() at time zone 'Asia/Taipei')::date as d
  )
  select m."id",
         m.name,
         m.name_roman,
         m.nickname,
         m.photo_url,
         m.color,
         case
           when cur.names is not null then cur.names
           when cur.solo then '{}'::text[]
           when latest.name is not null then array[latest.name]
           else '{}'::text[]
         end as group_names,
         m.updated_at
    from members m
   cross join today t
    left join lateral (
      select array_agg(distinct g.name) filter (where g.name is not null) as names,
             bool_or(h.group_id is null) as solo
        from history h
        left join groups g on g."id" = h.group_id
       where h.member_id = m."id"
         and h.is_approved is not false
         and h.status in ('active', 'trainee', 'concurrent', 'support')
         and (h.left_at is null or h.left_at::date >= t.d)
         and (
           (h.group_id is not null and g."id" is not null
              and (g.disbanded_at is null or g.disbanded_at::date > t.d))
           or (h.group_id is null and h.external_country is null)
         )
    ) cur on true
    left join lateral (
      select coalesce(g.name, h.external_group_name) as name
        from history h
        left join groups g on g."id" = h.group_id
       where h.member_id = m."id"
         and h.is_approved is not false
         and (h.group_id is not null or h.external_country is not null)
         and coalesce(g.name, h.external_group_name) is not null
       order by h.joined_at desc nulls last
       limit 1
    ) latest on true
   where nullif(btrim(m.photo_url), '') is not null
   order by m."id";
$$;

revoke all on function public.get_sukigao_candidates() from public, anon, authenticated;
grant execute on function public.get_sukigao_candidates() to anon, authenticated;
