-- SQL tests for migration 106 (顏控9選).
--
-- Runs in one transaction and rolls back, so it leaves no rows behind. Meant
-- for a local / staging database (scripts/test-sukigao-sql.sh builds a
-- throwaway one); any failed assertion raises and aborts the run.

begin;

-- ── Fixtures ────────────────────────────────────────────────────────────────
create temp table t_ids (label text primary key, id uuid not null) on commit drop;
grant select on t_ids to anon;

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

do $$ begin raise notice 'ALL SUKIGAO SQL TESTS PASSED'; end $$;

rollback;
