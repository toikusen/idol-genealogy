-- Migration 106: 台灣地偶顏控9選 (/sukigao)
--
-- 1. get_sukigao_candidates(): the pool of faces — members with a photo and a
--    current Taiwan group (or solo) relationship.
-- 2. sukigao_submissions / sukigao_submission_items: anonymous opt-in TOP 9
--    results. No direct access for anon/authenticated; writes go through
--    submit_sukigao_result(), reads through get_sukigao_ranking().
-- 3. One vote per browser per Taipei day: resubmitting the same day replaces
--    that day's TOP 9 instead of adding a second one.

-- ── 1. Candidate pool ──────────────────────────────────────────────────────
--
-- "Current" mirrors the member page (buildActiveGroups): status active /
-- trainee / concurrent / support. graduated, withdrawn, transferred and hiatus
-- are out. On top of that:
--   * left_at in the past means the relationship is over (support stints, and
--     active rows auto_graduate_expired_history() has not flipped yet);
--   * a group whose disbanded_at has passed is over (same rule as the home
--     page's active/disbanded tabs);
--   * group_id IS NULL with no external_country is a solo career (see the
--     history form: "solo 個人活動請留空國家欄位") and counts; with a country it
--     is an overseas group and does not;
--   * is_approved = false rows are ignored, like related_groups does.
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
  ),
  current_links as (
    select h.member_id, g.name as group_name
      from history h
      left join groups g on g.id = h.group_id
     cross join today t
     where h.is_approved is not false
       and h.status in ('active', 'trainee', 'concurrent', 'support')
       and (h.left_at is null or h.left_at::date >= t.d)
       and (
         (h.group_id is not null and g.id is not null
            and (g.disbanded_at is null or g.disbanded_at::date > t.d))
         or (h.group_id is null and h.external_country is null)
       )
  )
  select m.id,
         m.name,
         m.name_roman,
         m.nickname,
         m.photo_url,
         m.color,
         coalesce(
           array_agg(distinct cl.group_name) filter (where cl.group_name is not null),
           '{}'::text[]
         ) as group_names,
         m.updated_at
    from members m
    join current_links cl on cl.member_id = m.id
   where nullif(btrim(m.photo_url), '') is not null
   group by m.id
   order by m.id;
$$;

revoke all on function public.get_sukigao_candidates() from public, anon, authenticated;
grant execute on function public.get_sukigao_candidates() to anon, authenticated;

-- ── 2. Tables ──────────────────────────────────────────────────────────────

create table if not exists public.sukigao_submissions (
  id                uuid primary key default gen_random_uuid(),
  -- sha256 of the browser's random token; the token itself is never stored.
  browser_hash      text not null,
  -- Asia/Taipei calendar day.
  submitted_on      date not null,
  candidate_version text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint sukigao_submissions_browser_day_key unique (browser_hash, submitted_on)
);

create table if not exists public.sukigao_submission_items (
  submission_id uuid not null references public.sukigao_submissions(id) on delete cascade,
  member_id     uuid not null references public.members(id) on delete cascade,
  rank          smallint not null,
  created_at    timestamptz not null default now(),
  constraint sukigao_submission_items_rank_check check (rank between 1 and 9),
  constraint sukigao_submission_items_pkey primary key (submission_id, rank),
  constraint sukigao_submission_items_member_key unique (submission_id, member_id)
);

-- Ranking aggregates scan by member; rank = 1 feeds the first-place tab.
create index if not exists idx_sukigao_items_member_rank
  on public.sukigao_submission_items (member_id, rank);

alter table public.sukigao_submissions enable row level security;
alter table public.sukigao_submission_items enable row level security;

-- Deny-all policies (same pattern as view_session_log) plus revoked grants:
-- the only way in or out is the SECURITY DEFINER RPCs below.
drop policy if exists sukigao_submissions_no_direct_access on public.sukigao_submissions;
create policy sukigao_submissions_no_direct_access on public.sukigao_submissions
  for all using (false) with check (false);

drop policy if exists sukigao_submission_items_no_direct_access on public.sukigao_submission_items;
create policy sukigao_submission_items_no_direct_access on public.sukigao_submission_items
  for all using (false) with check (false);

revoke all on table public.sukigao_submissions from anon, authenticated;
revoke all on table public.sukigao_submission_items from anon, authenticated;

-- ── 3. Submit ──────────────────────────────────────────────────────────────

create or replace function public.submit_sukigao_result(
  p_browser_token     text,
  p_member_ids        uuid[],
  p_candidate_version text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_today    date := (now() at time zone 'Asia/Taipei')::date;
  v_hash     text;
  v_id       uuid;
  v_inserted boolean;
begin
  -- The client mints the token with crypto.randomUUID(); accept nothing else.
  if p_browser_token is null
     or p_browser_token !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    raise exception 'submit_sukigao_result: invalid browser token'
      using errcode = '22023';
  end if;

  if p_member_ids is null
     or array_ndims(p_member_ids) is distinct from 1
     or cardinality(p_member_ids) <> 9 then
    raise exception 'submit_sukigao_result: exactly 9 members required'
      using errcode = '22023';
  end if;

  if array_position(p_member_ids, null) is not null then
    raise exception 'submit_sukigao_result: member ids must not be null'
      using errcode = '22023';
  end if;

  if (select count(distinct m) from unnest(p_member_ids) as t(m)) <> 9 then
    raise exception 'submit_sukigao_result: duplicate member ids'
      using errcode = '22023';
  end if;

  if (select count(*) from members where id = any(p_member_ids)) <> 9 then
    raise exception 'submit_sukigao_result: unknown member id'
      using errcode = '22023';
  end if;

  v_hash := encode(sha256(convert_to('idolmaps:sukigao:' || lower(p_browser_token), 'UTF8')), 'hex');

  insert into sukigao_submissions (browser_hash, submitted_on, candidate_version)
  values (v_hash, v_today, left(p_candidate_version, 80))
  on conflict (browser_hash, submitted_on)
  do update set updated_at = now(),
                candidate_version = excluded.candidate_version
  returning id, (xmax = 0) into v_id, v_inserted;

  -- Same browser, same day: the latest TOP 9 replaces the earlier one.
  delete from sukigao_submission_items where submission_id = v_id;

  insert into sukigao_submission_items (submission_id, member_id, rank)
  select v_id, t.member_id, t.ord::smallint
    from unnest(p_member_ids) with ordinality as t(member_id, ord);

  return jsonb_build_object('submitted_on', v_today, 'replaced', not v_inserted);
end;
$$;

revoke all on function public.submit_sukigao_result(text, uuid[], text) from public, anon, authenticated;
grant execute on function public.submit_sukigao_result(text, uuid[], text) to anon, authenticated;

-- ── 4. Ranking ─────────────────────────────────────────────────────────────
--
-- Aggregated server side; clients never see raw submissions. group_name is the
-- member's current group when there is one, else their most recent group.
create or replace function public.get_sukigao_ranking(
  p_mode  text    default 'top9',
  p_limit integer default 100
)
returns table (
  member_id         uuid,
  name              text,
  photo_url         text,
  color             text,
  group_name        text,
  top9_count        bigint,
  first_place_count bigint,
  rank_counts       integer[]
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 100);
begin
  if p_mode is null or p_mode not in ('top9', 'first') then
    raise exception 'get_sukigao_ranking: invalid mode'
      using errcode = '22023';
  end if;

  return query
  with agg as (
    select i.member_id as agg_member_id,
           count(*) as agg_top9,
           count(*) filter (where i.rank = 1) as agg_first,
           array[
             count(*) filter (where i.rank = 1), count(*) filter (where i.rank = 2),
             count(*) filter (where i.rank = 3), count(*) filter (where i.rank = 4),
             count(*) filter (where i.rank = 5), count(*) filter (where i.rank = 6),
             count(*) filter (where i.rank = 7), count(*) filter (where i.rank = 8),
             count(*) filter (where i.rank = 9)
           ]::integer[] as agg_ranks
      from sukigao_submission_items i
     group by i.member_id
  )
  select m.id,
         m.name,
         m.photo_url,
         m.color,
         cg.group_name,
         a.agg_top9,
         a.agg_first,
         a.agg_ranks
    from agg a
    join members m on m.id = a.agg_member_id
    left join lateral (
      select g.name as group_name
        from history h
        join groups g on g.id = h.group_id
       where h.member_id = m.id
         and h.is_approved is not false
       order by (h.status in ('active', 'trainee', 'concurrent', 'support')
                 and (g.disbanded_at is null
                      or g.disbanded_at::date > (now() at time zone 'Asia/Taipei')::date)) desc,
                h.joined_at desc nulls last
       limit 1
    ) cg on true
   where p_mode = 'top9' or a.agg_first > 0
   order by case when p_mode = 'first' then a.agg_first else a.agg_top9 end desc,
            case when p_mode = 'first' then a.agg_top9 else a.agg_first end desc,
            m.name asc
   limit v_limit;
end;
$$;

revoke all on function public.get_sukigao_ranking(text, integer) from public, anon, authenticated;
grant execute on function public.get_sukigao_ranking(text, integer) to anon, authenticated;
