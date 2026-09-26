-- Migration 110: 顏控9選 — raise the per-IP daily submission cap 50 → 300.
--
-- Results are now submitted automatically when a game ends, so every finisher
-- behind a shared address counts: Taiwanese mobile carriers put many users on
-- one CGNAT IPv4, and fans often play together on venue Wi-Fi. 300/day still
-- stops a single script host from stuffing the ranking. Only the threshold
-- changes; the function is otherwise identical to 109.

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
  v_ip       text := btrim(split_part(
                       coalesce(v_hdrs ->> 'cf-connecting-ip', v_hdrs ->> 'x-forwarded-for', ''),
                       ',', 1));
  v_count    integer;
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

  if (select count(*) from members where id = any(p_member_ids)) <> 9 then
    raise exception 'submit_sukigao_result: unknown member id'
      using errcode = '22023';
  end if;

  -- Per-IP daily cap. Skipped when no client IP is available (direct DB use).
  if v_ip <> '' then
    insert into sukigao_ip_daily (ip_hash, submitted_on, submissions)
    values (encode(sha256(convert_to('idolmaps:sukigao:ip:' || v_ip, 'UTF8')), 'hex'), v_today, 1)
    on conflict (ip_hash, submitted_on)
    do update set submissions = sukigao_ip_daily.submissions + 1
    returning submissions into v_count;

    if v_count > 300 then
      raise exception 'submit_sukigao_result: too many submissions today'
        using errcode = 'P0001';
    end if;

    -- Occasional purge keeps the table to a few days of rows.
    if random() < 0.01 then
      delete from sukigao_ip_daily where submitted_on < v_today - 3;
    end if;
  end if;

  v_hash := encode(sha256(convert_to('idolmaps:sukigao:' || lower(p_browser_token), 'UTF8')), 'hex');

  insert into sukigao_submissions (browser_hash, submitted_on, candidate_version)
  values (v_hash, v_today, left(p_candidate_version, 80))
  on conflict (browser_hash, submitted_on)
  do update set updated_at = now(),
                candidate_version = excluded.candidate_version
  returning id, (xmax = 0) into v_id, v_inserted;

  delete from sukigao_submission_items where submission_id = v_id;

  insert into sukigao_submission_items (submission_id, member_id, rank)
  select v_id, t.member_id, t.ord::smallint
    from unnest(p_member_ids) with ordinality as t(member_id, ord);

  return jsonb_build_object('submitted_on', v_today, 'replaced', not v_inserted);
end;
$$;

revoke all on function public.submit_sukigao_result(text, uuid[], text) from public, anon, authenticated;
grant execute on function public.submit_sukigao_result(text, uuid[], text) to anon, authenticated;
