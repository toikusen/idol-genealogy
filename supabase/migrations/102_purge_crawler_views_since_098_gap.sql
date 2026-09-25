-- One-off: delete the crawler rows that arrived while 098 was not deployed.
--
-- 099 purged the table up to 2026-08-11 and 098 was supposed to stop new ones
-- at the door — but 098 was never applied to production (migration history
-- showed 098-101 local-only, while 099's backup table existed because it had
-- been run by hand in the SQL Editor). Verified empirically on 2026-08-18: an
-- increment_view call sent with a `bingbot/2.0` User-Agent was still recorded,
-- so the UA guard was absent, not merely ineffective. Pushing 098 installs it;
-- this migration cleans up the 137 rows the gap let in (2026-08-11 .. 08-18,
-- ~8% of member visitor tokens in that window).
--
-- SCOPE — identical CIDR list to 099, deliberately not widened: every one of
-- the 137 rows falls inside a /16 that migration already verified as AS8075
-- Microsoft. The one row outside it (34.125.x, GCP) is left alone for the same
-- reason 099 left GCP alone — generic cloud is not evidence of a crawler.
-- No date predicate is needed: 099 already removed everything older, so any
-- row still matching the list was recorded after it ran.
--
-- ponytail: copy of 099's four steps against a new snapshot table. No shared
-- helper, no generalized "purge crawlers" routine — this is the second time in
-- a week only because a migration was left unapplied, and 098 makes it the
-- last. Same under-subtraction caveat as 099: view_session_log upserts, so a
-- bot that returned after the 10-minute cooldown bumped page_view_daily more
-- than once but left one row here. Erring low can never push a day's count
-- below what real visitors did.

-- 1. Backup. Steps 2-4 all read from this snapshot so they cannot drift apart.
create table if not exists view_session_log_bot_bak_20260818 as
select * from view_session_log
where ip <<= any(array[
  -- Google (kept for symmetry with 099; expected to match 0 rows here)
  inet '66.249.64.0/19',
  inet '72.14.192.0/18',
  -- Microsoft / Bing — AS8075, per-/16 verified in 099
  inet '4.154.0.0/16',   inet '4.155.0.0/16',   inet '4.246.0.0/16',
  inet '20.114.0.0/16',  inet '20.115.0.0/16',  inet '20.125.0.0/16',
  inet '20.191.0.0/16',  inet '20.241.0.0/16',  inet '40.65.0.0/16',
  inet '40.77.0.0/16',   inet '40.125.0.0/16',  inet '65.55.0.0/16',
  inet '172.171.0.0/16', inet '199.30.16.0/20'
]);

-- Expect 137 rows / 74 entities / 2026-08-11 .. 2026-08-18:
-- select count(*) as rows, count(distinct entity_id) as entities,
--        min(viewed_at)::date, max(viewed_at)::date
--   from view_session_log_bot_bak_20260818;

-- 2. Daily rollup (Taipei date, matching how increment_view wrote it).
with removed as (
  select entity_type, entity_id,
         (viewed_at at time zone 'Asia/Taipei')::date as view_date,
         count(*) as n
  from view_session_log_bot_bak_20260818
  group by 1, 2, 3
)
update page_view_daily d
   set view_count = greatest(d.view_count - r.n, 0)
  from removed r
 where (d.entity_type, d.entity_id, d.view_date)
     = (r.entity_type, r.entity_id, r.view_date);

-- 3. All-time counter.
with removed as (
  select entity_type, entity_id, count(*) as n
  from view_session_log_bot_bak_20260818
  group by 1, 2
)
update page_views p
   set view_count = greatest(p.view_count - r.n, 0)
  from removed r
 where (p.entity_type, p.entity_id) = (r.entity_type, r.entity_id);

-- 4. Drop the rows. This is what moves 近期熱門 — the ranking counts distinct
--    session_token in view_session_log and reads neither table above.
delete from view_session_log v
using view_session_log_bot_bak_20260818 b
where (v.session_token, v.entity_type, v.entity_id)
    = (b.session_token, b.entity_type, b.entity_id);

-- 5. Verify: this must return 0, and stay 0 now that 098 is live.
-- select count(*) from view_session_log
--  where ip <<= any(array[inet '40.77.0.0/16', inet '4.246.0.0/16', inet '65.55.0.0/16']);
--
-- Drop both backup tables once a full day has passed with that count at zero:
--   drop table view_session_log_bot_bak_20260811, view_session_log_bot_bak_20260818;
