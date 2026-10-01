-- Migration 113: 顏控9選 — play stats for the result page + a per-network
-- counting cap.
--
-- 1. sukigao_submissions.counted: only the first 30 new results per network
--    (IPv4 address / IPv6 /64) per Taipei day count toward the ranking and the
--    stats. Later ones are still stored — the player sees them as added and
--    can replace them — but a single script host can move the numbers by at
--    most 30 a day instead of 300. Honest players past 30 on one shared
--    network drop out at random, so percentages stay unbiased.
-- 2. get_sukigao_stats(): total counted results, distinct players, and per-
--    member TOP 9 / first-place counts, for the result page's percentages.
--    Served through the edge-cached /api/sukigao-stats endpoint.
-- 3. get_sukigao_ranking() only counts counted results.
--
-- submit_sukigao_result() includes everything from 111.

alter table public.sukigao_submissions
  add column if not exists counted boolean not null default true;

-- ── 1. Submit ──────────────────────────────────────────────────────────────

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
  v_hdrs     json := nullif(current_setting('request.headers', true), '')::json;
  -- Cloudflare sets cf-connecting-ip in front of Supabase and clients can't
  -- forge it. x-forwarded-for is not read: its first entry is client-supplied.
  v_ip       text := btrim(coalesce(v_hdrs ->> 'cf-connecting-ip', ''));
  v_ip_key   text;
  v_count    integer;
  v_counted  boolean := true;
begin
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

  -- Only faces the game can show: an existing member with a photo.
  if (select count(*) from members
       where id = any(p_member_ids)
         and nullif(btrim(photo_url), '') is not null) <> 9 then
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

  -- Per-IP daily cap on *new* submissions only: a browser replaying (same-day
  -- replace) adds no vote, so it must not use up the cap shared by everyone
  -- behind the same CGNAT / venue Wi-Fi. IPv6 is keyed per /64 — one host
  -- usually owns a whole /64, so per-address keys would not cap anything.
  -- Skipped when no client IP is available (direct DB use).
  if v_inserted and v_ip <> '' then
    begin
      v_ip_key := case when strpos(v_ip, ':') > 0
                       then network(set_masklen(v_ip::inet, 64))::text
                       else host(v_ip::inet) end;
    exception when others then
      v_ip_key := left(v_ip, 64);  -- malformed header: still counted, never fatal
    end;

    insert into sukigao_ip_daily (ip_hash, submitted_on, submissions)
    values (encode(sha256(convert_to('idolmaps:sukigao:ip:' || v_ip_key, 'UTF8')), 'hex'), v_today, 1)
    on conflict (ip_hash, submitted_on)
    do update set submissions = sukigao_ip_daily.submissions + 1
    returning submissions into v_count;

    -- Raising rolls back the submission inserted above as well.
    if v_count > 300 then
      raise exception 'submit_sukigao_result: too many submissions today'
        using errcode = 'P0001';
    end if;

    -- Stored and replaceable as usual, but past the first 30 of the day from
    -- one network it no longer moves the ranking or the stats.
    v_counted := v_count <= 30;
    if not v_counted then
      update sukigao_submissions set counted = false where id = v_id;
    end if;

    -- Occasional purge keeps the table to a few days of rows.
    if random() < 0.01 then
      delete from sukigao_ip_daily where submitted_on < v_today - 3;
    end if;
  end if;

  delete from sukigao_submission_items where submission_id = v_id;

  insert into sukigao_submission_items (submission_id, member_id, rank)
  select v_id, t.member_id, t.ord::smallint
    from unnest(p_member_ids) with ordinality as t(member_id, ord);

  return jsonb_build_object('submitted_on', v_today, 'replaced', not v_inserted);
end;
$$;

revoke all on function public.submit_sukigao_result(text, uuid[], text) from public, anon, authenticated;
grant execute on function public.submit_sukigao_result(text, uuid[], text) to anon, authenticated;

-- ── 2. Stats ───────────────────────────────────────────────────────────────

create or replace function public.get_sukigao_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with counted as (
    select s.id, s.browser_hash
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
  )
  select jsonb_build_object(
    'total',   (select count(*) from counted),
    'players', (select count(distinct c.browser_hash) from counted c),
    'members', coalesce(
      (select jsonb_agg(jsonb_build_object('member_id', a.member_id, 'top9', a.top9, 'first', a.first)
                        order by a.top9 desc, a.member_id)
         from agg a),
      '[]'::jsonb)
  );
$$;

revoke all on function public.get_sukigao_stats() from public, anon, authenticated;
grant execute on function public.get_sukigao_stats() to anon, authenticated;

-- ── 3. Ranking: counted results only (otherwise identical to 106) ───────────

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
      join sukigao_submissions s on s.id = i.submission_id
     where s.counted
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
