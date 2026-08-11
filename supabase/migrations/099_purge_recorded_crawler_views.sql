-- One-off: delete crawler rows that 084's IP allowlist let through.
--
-- Migration 098 stops new ones at the door. This removes the 2,004 already in
-- the table (4.3% of view_session_log, 456 entities, 2026-06-22 .. 2026-08-11).
-- Without it the boards stay wrong for another week AND get_trending_* prints a
-- fake cliff the day 098 ships — it compares this week against last week, and
-- last week would still be counting Bingbot.
--
-- Effect on 近期熱門 (members, 7 days to 2026-08-11), measured before writing:
--     before                      after
--   1. 天川未來    47           1. 天川未來    45
--   2. 汐見ねおん  38           2. 汐見ねおん  37
--   3. 空花茉穗    24           3. 空花茉穗    24
--   4. 眠璃姬子    20           4. 桜野杏理    20
--   5. 桜野杏理    20           5. 浅松奈々未  19
--   ...                         8. 眠璃姬子    16
-- The graduated member who prompted this drops 4th → 8th. She does not leave
-- the board: 16 of her 20 "visitors" were not crawlers, and what they were is
-- still unknown — see the WATCH MODE section of scripts/audit-view-fraud.sql.
--
-- SCOPE — every /16 below was looked up on ipinfo.io and returned AS8075
-- Microsoft Corporation, plus the two Google ranges is_crawler_ip already
-- treats as crawlers. Deliberately NOT the wide announced blocks (4.128.0.0/9,
-- 20.0.0.0/8, 40.64.0.0/10 …): those cover addresses that have never appeared
-- in this log, and a one-off delete should have no speculative blast radius.
-- Also deliberately excluded: 19 rows from GCP (34.64.0.0/10, 35.192.0.0/12).
-- Generic cloud is not evidence of a crawler, and 19 rows is not worth the risk.
--
-- ponytail: plain create-as / update / delete. No admin tooling, no dry-run
-- flag — the backup table IS the dry run, inspect it before running step 3.

-- 1. Backup. Everything below reads from this snapshot, so the CIDR predicate
--    is evaluated exactly once and steps 2-4 cannot drift apart.
create table if not exists view_session_log_bot_bak_20260811 as
select * from view_session_log
where ip <<= any(array[
  -- Google (already in is_crawler_ip; these rows predate migration 084)
  inet '66.249.64.0/19',
  inet '72.14.192.0/18',
  -- Microsoft / Bing — AS8075, verified per /16 against the observed addresses
  inet '4.154.0.0/16',   inet '4.155.0.0/16',   inet '4.246.0.0/16',
  inet '20.114.0.0/16',  inet '20.115.0.0/16',  inet '20.125.0.0/16',
  inet '20.191.0.0/16',  inet '20.241.0.0/16',  inet '40.65.0.0/16',
  inet '40.77.0.0/16',   inet '40.125.0.0/16',  inet '65.55.0.0/16',
  inet '172.171.0.0/16', inet '199.30.16.0/20'
]);

-- Sanity-check the snapshot before going further. Expect ~2004 / 456.
-- select count(*) as rows, count(distinct entity_id) as entities,
--        min(viewed_at)::date, max(viewed_at)::date
--   from view_session_log_bot_bak_20260811;

-- 2. Daily rollup. Taipei date, matching how increment_view wrote it.
--    APPROXIMATE: view_session_log upserts, so viewed_at is the LAST view by
--    that token, while page_view_daily counted every call. A bot that came back
--    after the 10-minute cooldown bumped the daily count more than once but
--    left one row here, so this under-subtracts. Erring low is the right way to
--    be wrong — it can never push a real day's count below what humans did.
with removed as (
  select entity_type, entity_id,
         (viewed_at at time zone 'Asia/Taipei')::date as view_date,
         count(*) as n
  from view_session_log_bot_bak_20260811
  group by 1, 2, 3
)
update page_view_daily d
   set view_count = greatest(d.view_count - r.n, 0)
  from removed r
 where (d.entity_type, d.entity_id, d.view_date)
     = (r.entity_type, r.entity_id, r.view_date);

-- 3. All-time counter. Same under-subtraction caveat as step 2.
with removed as (
  select entity_type, entity_id, count(*) as n
  from view_session_log_bot_bak_20260811
  group by 1, 2
)
update page_views p
   set view_count = greatest(p.view_count - r.n, 0)
  from removed r
 where (p.entity_type, p.entity_id) = (r.entity_type, r.entity_id);

-- 4. Drop the rows. This is what actually moves 近期熱門 — the ranking counts
--    distinct session_token in view_session_log and reads neither table above.
delete from view_session_log v
using view_session_log_bot_bak_20260811 b
where (v.session_token, v.entity_type, v.entity_id)
    = (b.session_token, b.entity_type, b.entity_id);

-- 5. Verify.
-- select * from get_recent_popular_members(12, 7);
-- select count(*) from view_session_log where ip <<= inet '40.77.0.0/16';  -- 0

-- Keep view_session_log_bot_bak_20260811 until 098 is confirmed working (see
-- its header for the check), then drop it. To undo before that:
--   insert into view_session_log select * from view_session_log_bot_bak_20260811
--     on conflict do nothing;
--   -- and add the step 2/3 deltas back, flipping greatest(x - n, 0) to x + n.
