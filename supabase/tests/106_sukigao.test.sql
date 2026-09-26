-- SQL tests for migration 106 (顏控9選).
--
-- Runs in one transaction and rolls back, so it leaves no rows behind. Meant
-- for a local / staging database (scripts/test-sukigao-sql.sh builds a
-- throwaway one); any failed assertion raises and aborts the run.

begin;

-- ── Fixtures ────────────────────────────────────────────────────────────────
create temp table t_ids (label text primary key, id uuid not null) on commit drop;
grant select on t_ids to anon, authenticated;

insert into groups (id, name, disbanded_at) values
  ('00000000-0000-0000-0000-0000000000a1', '現役團', null),
  ('00000000-0000-0000-0000-0000000000a2', '解散團', date '2020-01-01'),
  ('00000000-0000-0000-0000-0000000000a3', '將解散團', date '2999-01-01');

do $$
declare
  i int;
  v uuid;
begin
  -- m01..m12: active members of 現役團 with photos
  for i in 1..12 loop
    insert into members (name, photo_url) values (format('m%s', lpad(i::text, 2, '0')), 'https://x/p.jpg')
      returning id into v;
    insert into t_ids values (format('m%s', lpad(i::text, 2, '0')), v);
    insert into history (member_id, group_id, status, joined_at)
      values (v, '00000000-0000-0000-0000-0000000000a1', 'active', date '2024-01-01');
  end loop;
end $$;

-- Eligibility edge cases
with ins as (
  insert into members (name, photo_url) values
    ('no_photo', null),
    ('blank_photo', '  '),
    ('graduated', 'https://x/p.jpg'),
    ('withdrawn', 'https://x/p.jpg'),
    ('hiatus', 'https://x/p.jpg'),
    ('trainee', 'https://x/p.jpg'),
    ('support_over', 'https://x/p.jpg'),
    ('disbanded_group', 'https://x/p.jpg'),
    ('disbanding_later', 'https://x/p.jpg'),
    ('solo', 'https://x/p.jpg'),
    ('overseas', 'https://x/p.jpg'),
    ('unapproved', 'https://x/p.jpg'),
    ('graduated_then_concurrent', 'https://x/p.jpg')
  returning id, name
)
insert into t_ids select name, id from ins;

insert into history (member_id, group_id, status, joined_at, left_at, external_group_name, external_country, is_approved)
select t.id, g, s, date '2023-01-01', l, e, c, a
  from t_ids t
  join (values
    ('no_photo',         '00000000-0000-0000-0000-0000000000a1'::uuid, 'active',     null::date,         null, null,  true),
    ('blank_photo',      '00000000-0000-0000-0000-0000000000a1'::uuid, 'active',     null,               null, null,  true),
    ('graduated',        '00000000-0000-0000-0000-0000000000a1'::uuid, 'graduated',  date '2024-01-01',  null, null,  true),
    ('withdrawn',        '00000000-0000-0000-0000-0000000000a1'::uuid, 'withdrawn',  date '2024-01-01',  null, null,  true),
    ('hiatus',           '00000000-0000-0000-0000-0000000000a1'::uuid, 'hiatus',     null,               null, null,  true),
    ('trainee',          '00000000-0000-0000-0000-0000000000a1'::uuid, 'trainee',    null,               null, null,  true),
    ('support_over',     '00000000-0000-0000-0000-0000000000a1'::uuid, 'support',    date '2024-01-01',  null, null,  true),
    ('disbanded_group',  '00000000-0000-0000-0000-0000000000a2'::uuid, 'active',     null,               null, null,  true),
    ('disbanding_later', '00000000-0000-0000-0000-0000000000a3'::uuid, 'active',     null,               null, null,  true),
    ('solo',             null,                                         'active',     null,               '個人', null, true),
    ('overseas',         null,                                         'active',     null,               'AKB', '日本', true),
    ('unapproved',       '00000000-0000-0000-0000-0000000000a1'::uuid, 'active',     null,               null, null,  false),
    ('graduated_then_concurrent', '00000000-0000-0000-0000-0000000000a2'::uuid, 'graduated', date '2020-01-01', null, null, true),
    ('graduated_then_concurrent', '00000000-0000-0000-0000-0000000000a3'::uuid, 'concurrent', null,             null, null, true)
  ) as v(label, g, s, l, e, c, a) on v.label = t.label;

-- ── Candidates (migration 107: everyone with a photo) ──────────────────────
do $$
declare
  got text[];
  want text[] := array['disbanded_group', 'disbanding_later', 'graduated', 'graduated_then_concurrent',
                       'hiatus', 'overseas', 'solo', 'support_over', 'trainee', 'unapproved', 'withdrawn']
    || array(select format('m%s', lpad(i::text, 2, '0')) from generate_series(1, 12) i);
begin
  select array_agg(name order by name) into got from get_sukigao_candidates();
  select array_agg(x order by x) into want from unnest(want) x;
  if got is distinct from want then
    raise exception 'candidates: expected %, got %', want, got;
  end if;

  if (select group_names from get_sukigao_candidates() where name = 'solo') <> '{}'::text[] then
    raise exception 'candidates: current solo should have no group names';
  end if;
  if (select group_names from get_sukigao_candidates() where name = 'graduated_then_concurrent') <> array['將解散團'] then
    raise exception 'candidates: a current group wins over a past one';
  end if;
  if (select group_names from get_sukigao_candidates() where name = 'graduated') <> array['現役團'] then
    raise exception 'candidates: graduated members show their last group';
  end if;
  if (select group_names from get_sukigao_candidates() where name = 'disbanded_group') <> array['解散團'] then
    raise exception 'candidates: disbanded-group members show that group';
  end if;
  if (select group_names from get_sukigao_candidates() where name = 'overseas') <> array['AKB'] then
    raise exception 'candidates: overseas-only members show the external group';
  end if;
  -- 108: is_current matches the 106 "current" rule.
  select array_agg(name order by name) into got from get_sukigao_candidates() where is_current;
  want := array['disbanding_later', 'graduated_then_concurrent', 'solo', 'trainee']
    || array(select format('m%s', lpad(i::text, 2, '0')) from generate_series(1, 12) i);
  select array_agg(x order by x) into want from unnest(want) x;
  if got is distinct from want then
    raise exception 'candidates: is_current expected %, got %', want, got;
  end if;
  raise notice 'ok: candidate pool = every member with a photo, is_current flags 現役';
end $$;

-- ── Submit validation ──────────────────────────────────────────────────────
create or replace function pg_temp.ids(n int, offs int default 0) returns uuid[] language sql as $$
  select array_agg(id order by label) from (
    select label, id from t_ids where label like 'm__' order by label offset offs limit n
  ) s;
$$;

create or replace function pg_temp.expect_error(p_sql text, p_label text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception '% should have been rejected', p_label;
exception
  when others then
    if sqlerrm like '% should have been rejected' then raise; end if;
    raise notice 'ok: % rejected (%)', p_label, sqlerrm;
end $$;

select pg_temp.expect_error(
  format('select submit_sukigao_result(%L, %L::uuid[])', '11111111-1111-4111-8111-111111111111', pg_temp.ids(8)),
  '8 members');
select pg_temp.expect_error(
  format('select submit_sukigao_result(%L, %L::uuid[])', '11111111-1111-4111-8111-111111111111', pg_temp.ids(10)),
  '10 members');
select pg_temp.expect_error(
  format('select submit_sukigao_result(%L, %L::uuid[])', '11111111-1111-4111-8111-111111111111',
         (pg_temp.ids(8)) || (pg_temp.ids(1))),
  'duplicate member');
select pg_temp.expect_error(
  format('select submit_sukigao_result(%L, %L::uuid[])', '11111111-1111-4111-8111-111111111111',
         (pg_temp.ids(8)) || array[gen_random_uuid()]),
  'unknown member');
select pg_temp.expect_error(
  format('select submit_sukigao_result(%L, %L::uuid[])', '11111111-1111-4111-8111-111111111111',
         (pg_temp.ids(8)) || array[null::uuid]),
  'null member');
select pg_temp.expect_error(
  format('select submit_sukigao_result(%L, %L::uuid[])', 'not-a-token', pg_temp.ids(9)),
  'bad token');
select pg_temp.expect_error(
  format('select submit_sukigao_result(null, %L::uuid[])', pg_temp.ids(9)),
  'null token');

-- ── Submit + same-day replace ──────────────────────────────────────────────
do $$
declare
  r jsonb;
  first_rank1 uuid;
begin
  if (select count(*) from sukigao_submissions) <> 0 then
    raise exception 'setup: rejected submissions must not leave rows';
  end if;

  r := submit_sukigao_result('11111111-1111-4111-8111-111111111111', pg_temp.ids(9), '16:2026');
  if (r->>'replaced')::boolean then raise exception 'first submit should not be a replace'; end if;
  if (select count(*) from sukigao_submission_items) <> 9 then raise exception 'exactly 9 accepted: want 9 items'; end if;

  -- Ranks follow array order.
  select member_id into first_rank1 from sukigao_submission_items where rank = 1;
  if first_rank1 <> (pg_temp.ids(9))[1] then raise exception 'rank 1 should be array[1]'; end if;
  raise notice 'ok: exactly 9 accepted, ranks follow array order';

  -- Same browser, same day, different TOP 9 → replaced, still one vote.
  r := submit_sukigao_result('11111111-1111-4111-8111-111111111111', pg_temp.ids(9, 3), '16:2026');
  if not (r->>'replaced')::boolean then raise exception 'second submit should replace'; end if;
  if (select count(*) from sukigao_submissions) <> 1 then raise exception 'same-day resubmit created a second submission'; end if;
  if (select count(*) from sukigao_submission_items) <> 9 then raise exception 'same-day resubmit: want 9 items, not 18'; end if;
  if (select member_id from sukigao_submission_items where rank = 1) <> (pg_temp.ids(9, 3))[1] then
    raise exception 'same-day resubmit should store the latest TOP 9';
  end if;
  raise notice 'ok: same browser same day replaces (1 submission, 9 items)';

  -- Token case does not dodge the rule.
  perform submit_sukigao_result('11111111-1111-4111-8111-111111111111', pg_temp.ids(9), null);
  perform submit_sukigao_result(upper('aaaaaaaa-1111-4111-8111-111111111111'), pg_temp.ids(9), null);
  perform submit_sukigao_result('aaaaaaaa-1111-4111-8111-111111111111', pg_temp.ids(9), null);
  if (select count(*) from sukigao_submissions) <> 2 then raise exception 'token case should not create extra votes'; end if;

  -- The raw token is never stored.
  if exists (select 1 from sukigao_submissions where browser_hash ilike '%1111-4111%') then
    raise exception 'browser token stored in clear';
  end if;

  -- A new day counts again.
  update sukigao_submissions set submitted_on = submitted_on - 1
   where browser_hash = encode(sha256(convert_to('idolmaps:sukigao:11111111-1111-4111-8111-111111111111', 'UTF8')), 'hex');
  perform submit_sukigao_result('11111111-1111-4111-8111-111111111111', pg_temp.ids(9), null);
  if (select count(*) from sukigao_submissions) <> 3 then raise exception 'next day should add a new submission'; end if;
  raise notice 'ok: different browser / next day count separately; token hashed';
end $$;

-- ── Ranking ────────────────────────────────────────────────────────────────
do $$
declare
  top record;
  n int;
begin
  -- 3 submissions of pg_temp.ids(9): m01 is #1 in all three.
  select * into top from get_sukigao_ranking('top9', 100) limit 1;
  if top.top9_count <> 3 then raise exception 'ranking top9: want 3, got %', top.top9_count; end if;

  select * into top from get_sukigao_ranking('first', 100) limit 1;
  if top.name <> 'm01' or top.first_place_count <> 3 then
    raise exception 'ranking first: want m01 ×3, got % ×%', top.name, top.first_place_count;
  end if;
  if top.rank_counts[1] <> 3 or cardinality(top.rank_counts) <> 9 then
    raise exception 'ranking rank_counts wrong: %', top.rank_counts;
  end if;
  if top.group_name <> '現役團' then raise exception 'ranking group_name: got %', top.group_name; end if;

  select count(*) into n from get_sukigao_ranking('first', 100);
  if exists (select 1 from get_sukigao_ranking('first', 100) where first_place_count = 0) then
    raise exception 'first-place tab should only list members with a first place';
  end if;

  select count(*) into n from get_sukigao_ranking('top9', 3);
  if n <> 3 then raise exception 'ranking limit: want 3, got %', n; end if;
  select count(*) into n from get_sukigao_ranking('top9', 1000000);
  if n > 100 then raise exception 'ranking limit should clamp to 100'; end if;
  select count(*) into n from get_sukigao_ranking('top9', -5);
  if n <> 1 then raise exception 'ranking limit should clamp up to 1'; end if;
  raise notice 'ok: ranking aggregates and limit clamp';
end $$;

select pg_temp.expect_error($q$select * from get_sukigao_ranking('drop table members', 10)$q$, 'invalid ranking mode');

-- ── 109/110: per-IP daily cap ───────────────────────────────────────────────────
do $$
declare
  i int;
  blocked boolean := false;
begin
  perform set_config('request.headers', '{"cf-connecting-ip":"203.0.113.7"}', true);
  for i in 1..300 loop
    perform submit_sukigao_result(
      format('%s-3333-4333-8333-333333333333', lpad(to_hex(i), 8, '0')), pg_temp.ids(9), null);
  end loop;
  begin
    perform submit_sukigao_result('ffffffff-3333-4333-8333-333333333333', pg_temp.ids(9), null);
  exception when others then
    blocked := sqlerrm like '%too many submissions today%';
  end;
  if not blocked then raise exception '301st submission from one IP should be rejected'; end if;
  if exists (select 1 from sukigao_ip_daily where ip_hash like '%203.0.113.7%') then
    raise exception 'raw IP must not be stored';
  end if;

  -- Another IP is unaffected; no IP header (direct DB use) skips the cap.
  perform set_config('request.headers', '{"x-forwarded-for":"198.51.100.1, 10.0.0.1"}', true);
  perform submit_sukigao_result('eeeeeeee-3333-4333-8333-333333333333', pg_temp.ids(9), null);
  perform set_config('request.headers', '', true);
  perform submit_sukigao_result('dddddddd-3333-4333-8333-333333333333', pg_temp.ids(9), null);
  raise notice 'ok: per-IP daily cap (300) with hashed IPs';
end $$;

-- ── 111: replays are free, IPv6 per /64, no x-forwarded-for, photo required ──
do $$
declare
  i int;
  blocked boolean := false;
  rows_before int;
  bad uuid[];
begin
  -- One browser replaying all day never uses up its IP's cap.
  perform set_config('request.headers', '{"cf-connecting-ip":"192.0.2.44"}', true);
  for i in 1..310 loop
    perform submit_sukigao_result('abababab-4444-4444-8444-444444444444', pg_temp.ids(9), null);
  end loop;
  if (select submissions from sukigao_ip_daily
       where ip_hash = encode(sha256(convert_to('idolmaps:sukigao:ip:192.0.2.44', 'UTF8')), 'hex')) <> 1 then
    raise exception 'same-day replays should not count against the IP cap';
  end if;

  -- Rotating addresses inside one IPv6 /64 shares a single cap.
  for i in 1..300 loop
    perform set_config('request.headers', format('{"cf-connecting-ip":"2001:db8:1:2::%s"}', to_hex(i)), true);
    perform submit_sukigao_result(
      format('%s-5555-4555-8555-555555555555', lpad(to_hex(i), 8, '0')), pg_temp.ids(9), null);
  end loop;
  perform set_config('request.headers', '{"cf-connecting-ip":"2001:db8:1:2:ffff:ffff:ffff:ffff"}', true);
  begin
    perform submit_sukigao_result('ffffffff-5555-4555-8555-555555555555', pg_temp.ids(9), null);
  exception when others then
    blocked := sqlerrm like '%too many submissions today%';
  end;
  if not blocked then raise exception 'an IPv6 /64 should share one cap'; end if;
  -- …and the rejected submission was rolled back with it.
  if exists (select 1 from sukigao_submissions
              where browser_hash = encode(sha256(convert_to('idolmaps:sukigao:ffffffff-5555-4555-8555-555555555555', 'UTF8')), 'hex')) then
    raise exception 'a capped submission must not be stored';
  end if;

  -- A malformed header is still counted, never fatal.
  perform set_config('request.headers', '{"cf-connecting-ip":"not-an-ip"}', true);
  perform submit_sukigao_result('cdcdcdcd-4444-4444-8444-444444444444', pg_temp.ids(9), null);

  -- x-forwarded-for alone is ignored (its first entry is client-supplied).
  select count(*) into rows_before from sukigao_ip_daily;
  perform set_config('request.headers', '{"x-forwarded-for":"6.6.6.6, 1.1.1.1"}', true);
  perform submit_sukigao_result('efefefef-4444-4444-8444-444444444444', pg_temp.ids(9), null);
  if (select count(*) from sukigao_ip_daily) <> rows_before then
    raise exception 'x-forwarded-for must not key the IP cap';
  end if;
  perform set_config('request.headers', '', true);

  -- Members without a photo can't be voted in.
  bad := pg_temp.ids(8) || (select id from t_ids where label = 'no_photo');
  blocked := false;
  begin
    perform submit_sukigao_result('12121212-4444-4444-8444-444444444444', bad, null);
  exception when others then
    blocked := sqlerrm like '%unknown member id%';
  end;
  if not blocked then raise exception 'a member without a photo should be rejected'; end if;
  raise notice 'ok: 111 submit hardening';
end $$;

-- ── 113: per-network counting cap + stats ───────────────────────────────────
do $$
declare
  i int;
  before_total bigint;
  after_total bigint;
  before_m01 bigint;
  after_m01 bigint;
  m01 uuid := (select id from t_ids where label = 'm01');
  stats jsonb;
begin
  stats := get_sukigao_stats();
  before_total := (stats ->> 'total')::bigint;
  select (e ->> 'top9')::bigint into before_m01
    from jsonb_array_elements(stats -> 'members') e where (e ->> 'member_id')::uuid = m01;

  -- 35 new results from one network: all stored, only 30 counted.
  perform set_config('request.headers', '{"cf-connecting-ip":"192.0.2.99"}', true);
  for i in 1..35 loop
    perform submit_sukigao_result(
      format('%s-6666-4666-8666-666666666666', lpad(to_hex(i), 8, '0')), pg_temp.ids(9), null);
  end loop;
  -- A replay of an uncounted result stays uncounted.
  perform submit_sukigao_result('00000023-6666-4666-8666-666666666666', pg_temp.ids(9), null);
  perform set_config('request.headers', '', true);

  if (select count(*) from sukigao_submissions where browser_hash in (
        select encode(sha256(convert_to('idolmaps:sukigao:' || format('%s-6666-4666-8666-666666666666', lpad(to_hex(g.n), 8, '0')), 'UTF8')), 'hex')
          from generate_series(1, 35) as g(n))) <> 35 then
    raise exception 'all 35 results should be stored';
  end if;

  stats := get_sukigao_stats();
  after_total := (stats ->> 'total')::bigint;
  select (e ->> 'top9')::bigint into after_m01
    from jsonb_array_elements(stats -> 'members') e where (e ->> 'member_id')::uuid = m01;
  if after_total - before_total <> 30 then
    raise exception 'stats total should grow by 30, grew by %', after_total - before_total;
  end if;
  if after_m01 - before_m01 <> 30 then
    raise exception 'member count should grow by 30, grew by %', after_m01 - before_m01;
  end if;
  if (select top9_count from get_sukigao_ranking('top9', 100) where member_id = m01) <> after_m01 then
    raise exception 'ranking and stats should agree on counted results';
  end if;
  if (stats ->> 'players')::bigint > after_total then
    raise exception 'players cannot exceed results';
  end if;
  if jsonb_typeof(stats -> 'members') <> 'array' then
    raise exception 'members should be an array';
  end if;
  -- Every counted result has exactly one #1 and nine TOP 9 picks.
  if (select sum((e ->> 'first')::bigint) from jsonb_array_elements(stats -> 'members') e) <> after_total then
    raise exception 'first-place counts should add up to the number of results';
  end if;
  if (select sum((e ->> 'top9')::bigint) from jsonb_array_elements(stats -> 'members') e) <> after_total * 9 then
    raise exception 'TOP 9 counts should add up to 9 × results';
  end if;
  if (select sum(first_place_count) from get_sukigao_ranking('first', 100)) <> after_total then
    raise exception 'the first-place ranking should add up to the number of results';
  end if;
  raise notice 'ok: 113 counting cap + stats';
end $$;

-- ── Direct access is blocked for anon / authenticated ──────────────────────
set local role anon;

select pg_temp.expect_error(
  $q$insert into sukigao_submissions (browser_hash, submitted_on) values ('x', current_date)$q$,
  'anon insert submissions');
select pg_temp.expect_error(
  $q$insert into sukigao_submission_items (submission_id, member_id, rank) select id, (select id from t_ids where label = 'm01'), 1 from sukigao_submissions limit 1$q$,
  'anon insert items');
select pg_temp.expect_error($q$select * from sukigao_submissions$q$, 'anon select submissions');
select pg_temp.expect_error($q$select * from sukigao_submission_items$q$, 'anon select items');
select pg_temp.expect_error($q$update sukigao_submission_items set rank = 1$q$, 'anon update items');
select pg_temp.expect_error($q$delete from sukigao_submission_items$q$, 'anon delete items');
select pg_temp.expect_error($q$delete from sukigao_submissions$q$, 'anon delete submissions');

-- …but the RPCs work as anon.
do $$
begin
  perform submit_sukigao_result('22222222-2222-4222-8222-222222222222',
    (select array_agg(id order by label) from (select label, id from t_ids where label like 'm__' order by label limit 9) s));
  if (select count(*) from get_sukigao_ranking('top9', 100)) = 0 then
    raise exception 'anon should be able to read the ranking';
  end if;
  if (select count(*) from get_sukigao_candidates()) = 0 then
    raise exception 'anon should be able to read candidates';
  end if;
  if (get_sukigao_stats() ->> 'total')::bigint = 0 then
    raise exception 'anon should be able to read the stats';
  end if;
  raise notice 'ok: anon can use the RPCs';
end $$;

set local role authenticated;
select pg_temp.expect_error(
  $q$insert into sukigao_submissions (browser_hash, submitted_on) values ('x', current_date)$q$,
  'authenticated insert submissions');
select pg_temp.expect_error($q$select * from sukigao_submission_items$q$, 'authenticated select items');

reset role;

-- RLS is a second wall: even if someone re-grants the tables, the deny-all
-- policies still reject anon writes and hide rows.
grant select, insert on sukigao_submissions to anon;
set local role anon;
select pg_temp.expect_error(
  $q$insert into sukigao_submissions (browser_hash, submitted_on) values ('x', current_date)$q$,
  'anon insert with grants restored (RLS)');
do $$
begin
  if (select count(*) from sukigao_submissions) <> 0 then
    raise exception 'RLS should hide submissions from anon';
  end if;
  raise notice 'ok: RLS hides submissions even with a stray grant';
end $$;
reset role;
revoke all on sukigao_submissions from anon;

-- ── 114: personal history for signed-in players ─────────────────────────────
insert into auth.users (id) values
  ('00000000-0000-4000-8000-00000000aaaa'),
  ('00000000-0000-4000-8000-00000000bbbb');

-- Signed out: refused.
set local role anon;
select pg_temp.expect_error(
  $q$select save_my_sukigao_result('11111111-1111-4111-8111-111111111111', pg_temp.ids(9))$q$,
  'anon save_my_sukigao_result');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.expect_error(
  $q$select save_my_sukigao_result('11111111-1111-4111-8111-111111111111', pg_temp.ids(9))$q$,
  'save without a user');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000aaaa', true);
select pg_temp.expect_error(
  $q$select save_my_sukigao_result('not-a-uuid', pg_temp.ids(9))$q$, 'save with a bad session id');
select pg_temp.expect_error(
  $q$select save_my_sukigao_result('11111111-1111-4111-8111-111111111111', pg_temp.ids(8))$q$, 'save 8 members');
select pg_temp.expect_error(
  $q$select save_my_sukigao_result('11111111-1111-4111-8111-111111111111', pg_temp.ids(8) || (pg_temp.ids(1))[1])$q$, 'save a duplicate');
select pg_temp.expect_error(
  $q$select save_my_sukigao_result('11111111-1111-4111-8111-111111111111', pg_temp.ids(8) || gen_random_uuid())$q$, 'save an unknown member');
select pg_temp.expect_error(
  $q$insert into sukigao_user_results (user_id, session_id, member_ids) values ('00000000-0000-4000-8000-00000000aaaa', 'x', pg_temp.ids(9))$q$,
  'direct insert');

do $$
declare
  i int;
  n int;
begin
  perform save_my_sukigao_result('11111111-1111-4111-8111-111111111111', pg_temp.ids(9), 'v1');
  -- Same game again (undo + finish): replaced, not added.
  perform save_my_sukigao_result('11111111-1111-4111-8111-111111111111', pg_temp.ids(9, 1), 'v1');
  select count(*) into n from sukigao_user_results;
  if n <> 1 then raise exception 'same session should replace, have %', n; end if;
  if (select member_ids from sukigao_user_results) <> pg_temp.ids(9, 1) then
    raise exception 'replaced row should hold the new TOP 9';
  end if;

  -- Only the latest 100 are kept.
  for i in 1..105 loop
    perform save_my_sukigao_result(format('%s-7777-4777-8777-777777777777', lpad(to_hex(i), 8, '0')), pg_temp.ids(9), null);
  end loop;
  select count(*) into n from sukigao_user_results;
  if n <> 100 then raise exception 'should keep 100 games, have %', n; end if;
  -- The oldest ones went: the first game and sessions 1–4.
  if exists (select 1 from sukigao_user_results
              where session_id in ('11111111-1111-4111-8111-111111111111', '00000004-7777-4777-8777-777777777777')) then
    raise exception 'trim should drop the oldest games';
  end if;
  raise notice 'ok: 114 save, replace and trim';
end $$;

-- Another account can't see or delete them.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000bbbb', true);
do $$
begin
  if (select count(*) from sukigao_user_results) <> 0 then
    raise exception 'another user must not see these results';
  end if;
  delete from sukigao_user_results;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000aaaa', true);
do $$
begin
  if (select count(*) from sukigao_user_results) <> 100 then
    raise exception 'another user must not delete these results';
  end if;
  delete from sukigao_user_results where session_id = '00000069-7777-4777-8777-777777777777';
  if (select count(*) from sukigao_user_results) <> 99 then
    raise exception 'the owner should be able to delete a result';
  end if;
  raise notice 'ok: 114 results are private to their owner';
end $$;
reset role;

do $$ begin raise notice 'ALL SUKIGAO SQL TESTS PASSED'; end $$;

rollback;
