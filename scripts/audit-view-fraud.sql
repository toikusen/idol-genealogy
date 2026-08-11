-- View-fraud audit for a single member/group.
--
-- Detects deliberate inflation of the popularity/trending boards (someone
-- minting session tokens / rotating IPs to fake "distinct visitors").
-- Requires the ip column added in migration 080 — only rows recorded AFTER
-- that migration have an IP; older rows are NULL.
--
-- Run in the Supabase SQL Editor (these tables are RLS-locked to the public).
-- Change the id / type in the `params` CTE of each query below.
--
-- Reading the results — a row is suspicious when it combines:
--   * the IP/token only ever touched THIS one entity, and
--   * views cluster tightly in time, and
--   * the entity has no organic reason for traffic (e.g. graduated, no news).
-- Caveat: TW mobile carriers use CGNAT, so many real users can share one IP.
-- "Many tokens from one IP" alone is not proof — combine the signals above.


-- 1. Which IPs viewed this entity, how many tokens each minted, and whether
--    they only ever looked at this one entity (look_at_entities = 1 = susp.).
with params as (select 'member'::text as etype,
                       '85783995-537c-477e-ad28-fcd04fe1f51f'::uuid as eid)
select v.ip,
       count(distinct v.session_token) as tokens,
       count(distinct v.entity_id)     as looked_at_entities,
       min(v.viewed_at) as first_seen,
       max(v.viewed_at) as last_seen
from view_session_log v, params
where v.ip in (
  select v2.ip from view_session_log v2, params
  where v2.entity_type = params.etype
    and v2.entity_id   = params.eid
    and v2.ip is not null
)
group by v.ip
order by looked_at_entities asc, tokens desc;


-- 2. Per-hour spread for this entity: a spike in distinct_ips (many different
--    IPs hitting one quiet entity in the same hour) = IP rotation to bypass
--    the per-IP 10-minute guard.
with params as (select 'member'::text as etype,
                       '85783995-537c-477e-ad28-fcd04fe1f51f'::uuid as eid)
select date_trunc('hour', v.viewed_at) as hr,
       count(distinct v.ip)            as distinct_ips,
       count(distinct v.session_token) as tokens
from view_session_log v, params
where v.entity_type = params.etype
  and v.entity_id   = params.eid
  and v.ip is not null
group by 1
order by 1 desc;


-- 3. Sanity invariant: page_views.view_count should always be >= distinct
--    tokens in view_session_log. If it is LESS, the counter was reset/deleted
--    while the token log kept accumulating (i.e. someone cleaned the score but
--    the inflation source is still active).
with params as (select 'member'::text as etype,
                       '85783995-537c-477e-ad28-fcd04fe1f51f'::uuid as eid)
select (select view_count from page_views, params
          where page_views.entity_type = params.etype
            and page_views.entity_id   = params.eid)        as total_increments,
       (select count(*) from view_session_log v, params
          where v.entity_type = params.etype
            and v.entity_id   = params.eid)                 as distinct_tokens;

-- Then take any suspicious IP to an external lookup for ISP / datacenter / VPN:
--   curl -s ipinfo.io/<ip>
-- A datacenter or VPN IP viewing a quiet entity is almost certainly automated.


-- ---------------------------------------------------------------------------
-- WATCH MODE — is one person repeatedly padding this entity?
--
-- ponytail: no new table. view_session_log has never been pruned (oldest row
-- 2026-03-22) so it already IS the record; queries 4-5 just read it. Add a
-- snapshot table only if a retention job ever starts deleting rows.
--
-- TW consumer ISPs hand out dynamic IPs, so a returning visitor rarely keeps
-- the same address — match on the network, not the exact IP. Query 4 reports
-- /24 and /16 side by side because neither alone is conclusive:
--   /24 is tight enough to mean "same subscriber" but dynamic reassignment
--       moves people out of it, so repeats are rare (as of 2026-08-11 the only
--       repeating /24s on this entity were Googlebot and Bingbot);
--   /16 catches those people again but is a whole ISP pool, so a repeat there
--       is meaningless on its own — read pct_of_net_traffic, not the raw count.
-- ---------------------------------------------------------------------------

-- 4. Repeat networks, at both granularities. The column that matters is
--    pct_of_net_traffic: what share of everything that network ever did on the
--    site was aimed at THIS entity. A residential /16 sending 3% of its
--    traffic here is noise; one sending 60% is a person with a purpose.
with params as (select 'member'::text as etype,
                       '85783995-537c-477e-ad28-fcd04fe1f51f'::uuid as eid),
     grain  as (select unnest(array[24, 16]) as bits),
     hers as (
       select set_masklen(v.ip, g.bits) as net, g.bits, v.viewed_at
       from view_session_log v, params p, grain g
       where v.entity_type = p.etype
         and v.entity_id   = p.eid
         and v.ip is not null
     ),
     netall as (
       select set_masklen(o.ip, g.bits) as net, g.bits,
              count(*)                                    as net_hits_sitewide,
              count(distinct (o.entity_type, o.entity_id)) as net_entities
       from view_session_log o, grain g
       where o.ip is not null
       group by 1, 2
     )
select h.bits, h.net,
       count(*)                          as her_hits,
       count(distinct h.viewed_at::date) as days_active,
       min(h.viewed_at)::date            as first_seen,
       max(h.viewed_at)::date            as last_seen,
       n.net_hits_sitewide,
       n.net_entities,
       round(100.0 * count(*) / n.net_hits_sitewide, 1) as pct_of_net_traffic
from hers h
join netall n on n.net = h.net and n.bits = h.bits
group by h.bits, h.net, n.net_hits_sitewide, n.net_entities
having count(*) > 1
order by h.bits desc, days_active desc, her_hits desc;


-- 5. What's new since the last time you looked. Edit the date, run it weekly.
--    A network already in the baseline below is a repeat; anything else is new.
with params as (select 'member'::text as etype,
                       '85783995-537c-477e-ad28-fcd04fe1f51f'::uuid as eid,
                       date '2026-08-11' as since)
select v.viewed_at, v.ip, set_masklen(v.ip, 24) as net24,
       (select count(distinct o.entity_id) from view_session_log o
         where o.ip = v.ip)                as ip_looked_at_entities
from view_session_log v, params
where v.entity_type = params.etype
  and v.entity_id   = params.eid
  and v.viewed_at >= params.since
order by v.viewed_at;


-- BASELINE — 眠璃姬子, the 21 IPs seen in the 7 days up to 2026-08-11.
-- Recorded by hand so query 5 has something to diff against. Classification
-- came from ipinfo.io; "solo" = that IP viewed her and nothing else.
--
--   Bing / Azure crawlers (AS8075, not covered by is_crawler_ip):
--     65.55.210.43 (msnbot reverse-DNS), 40.125.81.216,
--     4.246.109.99, 4.246.75.249
--   Proxy / hosting:
--     187.15.122.149  AS147049 PacketHub (Datacamp/CDN77), saw 45 entities
--   Heavy scrape session:
--     111.108.217.235 JP KDDI, one token, 201 entities
--   solo — viewed only her, TW consumer ISPs:
--     61.58.95.82     08-04 10:58  TBC 桃園
--     223.140.52.244  08-06 08:19  中華行動 台北
--     203.121.232.134 08-07 18:40  DaDa Broadband 板橋
--     223.141.101.45  08-09 20:53  中華行動 台中
--     150.129.228.31  08-10 17:18  DaDa Broadband 板橋   <-- these three are
--     218.35.164.69   08-10 17:34  APOL 板橋              <-- 19 minutes apart,
--     114.140.88.109  08-10 17:37  遠傳 高雄              <-- 3 different ISPs
--   ordinary browsing (also viewed 2-114 other entities):
--     1.172.134.251, 111.243.168.48, 223.143.243.206, 163.29.253.151,
--     114.140.89.205, 218.35.7.102, 180.218.174.36, 123.241.247.158
--
-- Query 4 run against the full history (2026-03-22 .. 2026-08-11), 159 rows
-- with an IP across 131 distinct /24s. Result: NO evidence of one persistent
-- person. Specifically —
--   * the only /24s that repeated at all were Googlebot (66.249.79.0/24, 25
--     hits over 13 days), Google 72.14.199.0/24 and Bingbot 40.77.177.0/24,
--     plus 114.136.194.0/24 which was two hits inside a single day;
--   * every residential /16 that repeated sent <7% of its lifetime site
--     traffic to her (218.35.x 6.4%, 4.246.x 4.8%, 223.141.x 4.4%). Those are
--     ISP pools behaving normally, not a stalker.
--   * the highest percentages in the table (59.127.x and 114.45.x at 13%) come
--     from networks with 15 total hits each — small-sample noise, not signal.
--
-- So the baseline is "clean". If someone IS padding her, they have not done it
-- from a stable network yet. What would change that verdict, in order of
-- strength: a residential /24 reappearing on 3+ separate days; any network
-- whose pct_of_net_traffic climbs past ~30%; or another cluster like the three
-- solo IPs on 08-10 17:18-17:37 repeating on a later date.
--
-- Caveat that applies to all of the above: TW carriers use CGNAT, so one /24
-- can legitimately cover many unrelated people, and one person on mobile data
-- can appear as many /24s. Absence of a repeat is weak evidence, not proof.
