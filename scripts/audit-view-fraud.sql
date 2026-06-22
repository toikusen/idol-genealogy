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
