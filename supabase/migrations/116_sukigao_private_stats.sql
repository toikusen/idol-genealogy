-- Migration 116: 顏控9選 — no public cross-member numbers.
--
-- Showing who is picked most (and least) turns a fun game into a ranking of
-- the members' looks. The public site now only shows how many games were
-- played and by how many people; per-member counts are 後台 only.
--
-- 1. get_sukigao_summary(): total / plays / players, nothing per member.
--    Public (anon), served through the edge-cached /api/sukigao-stats.
-- 2. get_sukigao_admin_stats(): per-member TOP 9 / first-place counts, the
--    game setups (scope + size) and the last 14 days. Staff only.
-- 3. get_sukigao_ranking() and get_sukigao_stats() are dropped: both handed
--    per-member counts to anyone.

-- ── 1. Public summary ──────────────────────────────────────────────────────

create or replace function public.get_sukigao_summary()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'total',   count(*),
    'plays',   coalesce(sum(s.plays), 0),
    'players', count(distinct s.browser_hash)
  )
    from sukigao_submissions s
   where s.counted;
$$;

revoke all on function public.get_sukigao_summary() from public, anon, authenticated;
grant execute on function public.get_sukigao_summary() to anon, authenticated;

-- ── 2. Staff-only stats ────────────────────────────────────────────────────

create or replace function public.get_sukigao_admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Taipei')::date;
  v_out   jsonb;
begin
  if not coalesce(public.is_staff(), false) then
    raise exception 'get_sukigao_admin_stats: staff only'
      using errcode = '42501';
  end if;

  with counted as (
    select s.id, s.browser_hash, s.plays, s.submitted_on, s.candidate_version
      from sukigao_submissions s
     where s.counted
  ),
  agg as (
    select i.member_id,
           count(*) as top9,
           count(*) filter (where i.rank = 1) as first
      from sukigao_submission_items i
      join counted c on c.id = i.submission_id
     group by i.member_id
  ),
  -- candidate_version is 'pool version|scope|size' (older rows: no suffix).
  setups as (
    select nullif(split_part(c.candidate_version, '|', 2), '') as scope,
           nullif(split_part(c.candidate_version, '|', 3), '') as size,
           count(*) as results
      from counted c
     group by 1, 2
  ),
  days as (
    select d::date as day
      from generate_series(v_today - 13, v_today, interval '1 day') as g(d)
  )
  select jsonb_build_object(
    'total',   (select count(*) from counted),
    'plays',   (select coalesce(sum(c.plays), 0) from counted c),
    'players', (select count(distinct c.browser_hash) from counted c),
    'members', coalesce(
      (select jsonb_agg(jsonb_build_object('member_id', a.member_id, 'name', m.name,
                                           'top9', a.top9, 'first', a.first)
                        order by a.top9 desc, a.first desc, m.name)
         from agg a
         join members m on m.id = a.member_id),
      '[]'::jsonb),
    'setups', coalesce(
      (select jsonb_agg(jsonb_build_object('scope', st.scope, 'size', st.size, 'results', st.results)
                        order by st.results desc)
         from setups st),
      '[]'::jsonb),
    'daily', (
      select jsonb_agg(jsonb_build_object(
               'day', to_char(dd.day, 'YYYY-MM-DD'),
               'results', (select count(*) from counted c where c.submitted_on = dd.day),
               'plays', (select coalesce(sum(c.plays), 0) from counted c where c.submitted_on = dd.day))
             order by dd.day)
        from days dd)
  ) into v_out;

  return v_out;
end;
$$;

revoke all on function public.get_sukigao_admin_stats() from public, anon, authenticated;
grant execute on function public.get_sukigao_admin_stats() to authenticated;

-- ── 3. Drop the public per-member readers ──────────────────────────────────

drop function if exists public.get_sukigao_ranking(text, integer);
drop function if exists public.get_sukigao_stats();
