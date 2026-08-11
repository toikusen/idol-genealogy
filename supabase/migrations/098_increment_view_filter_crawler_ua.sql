-- Drop crawler views by User-Agent instead of chasing IP ranges.
--
-- Migration 084 already said "search-engine crawlers are not visitors", but it
-- enforced that with a three-entry IP allowlist (Googlebot + one Azure /16).
-- Microsoft's crawlers do not live in that /16: as of 2026-08-11 the log holds
-- 544 rows from AS8075 ranges the list never covered, 136 of them in the last
-- seven days alone. On a quiet entity that is enough to move it several places
-- up 近期熱門 — one graduated member's 21 "distinct visitors" were 4 Bingbot.
--
-- The IP list cannot win this. Microsoft alone announces new ranges faster than
-- anyone will hand-edit a CIDR array, and the same bots arrive from 274 distinct
-- addresses. Crawlers do, however, identify themselves honestly in User-Agent —
-- bingbot, Googlebot, AhrefsBot, SemrushBot all say so. One regex covers every
-- crawler that has ever hit this site plus the ones that have not yet.
--
-- ponytail: one `if` on a header, no list to maintain. A UA can be forged, but
-- an adversary willing to forge one also rotates IPs, so the allowlist would not
-- have stopped them either — this is not a weaker ceiling than what it replaces.
-- Known accepted false positive: 'bot' is matched as a bare substring, so an
-- Android phone whose model name embeds it (CUBOT, and nothing else seen in the
-- wild) is silently not counted. Anchoring to 'bot[/;)\s-]' would fix that and
-- would also start missing bots that format their UA any other way; one lost
-- phone owner is the cheaper error. Revisit only if a real user reports it.
--
-- is_crawler_ip stays exactly as it is. It is now the cheap second layer for the
-- handful of bots that send a blank UA; deliberately NOT extended, because
-- extending it is the maintenance treadmill this migration exists to get off.
--
-- Fails open: if PostgREST does not expose 'user-agent' in request.headers, the
-- ->> yields NULL, `NULL ~* '...'` is NULL, and the `if` does not fire. Worst
-- case this migration changes nothing; it cannot start dropping real visitors.
-- Confirm which happened after deploying:
--   select count(*) from view_session_log where viewed_at > now() - interval '1 day'
--     and ip <<= any(array[inet '40.64.0.0/10', inet '20.0.0.0/8']);
-- Bingbot hits this site every few hours, so a full day at zero means it works.

create or replace function public.increment_view(p_type text, p_id uuid, p_session_token uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_hdrs json := nullif(current_setting('request.headers', true), '')::json;
  v_ip   text := split_part(
                   coalesce(v_hdrs ->> 'cf-connecting-ip',
                            v_hdrs ->> 'x-forwarded-for', ''),
                   ',', 1);  -- first hop = real client
  v_ua   text := v_hdrs ->> 'user-agent';
begin
  -- Search-engine crawlers are not visitors: don't record anything.
  -- Self-declared bots first — no list to keep current. Cases in
  -- scripts/crawler-ua.test.mjs; keep the two in sync.
  if v_ua ~* '(bot|crawl|spider|slurp|headless|facebookexternalhit)' then
    return;
  end if;

  -- Second layer, for crawlers that send no UA at all.
  if v_ip <> '' and is_crawler_ip(v_ip::inet) then
    return;
  end if;

  -- Same token already counted this entity within 10 minutes → skip.
  if exists (
    select 1 from view_session_log
    where session_token = p_session_token
      and entity_type   = p_type
      and entity_id     = p_id
      and viewed_at     > now() - interval '10 minutes'
  ) then
    return;
  end if;

  -- ponytail: same client IP already counted this entity within 10 minutes →
  -- skip. Kills the observed "many fresh tokens from one IP" burst. Widen the
  -- window (e.g. '1 day') if an attacker starts spacing requests out — but a
  -- longer window also collapses real users sharing one CGNAT IP (common on
  -- TW mobile). Skip the guard entirely when no IP is available.
  if v_ip <> '' and exists (
    select 1 from view_session_log
    where ip          = v_ip::inet
      and entity_type = p_type
      and entity_id   = p_id
      and viewed_at   > now() - interval '10 minutes'
  ) then
    return;
  end if;

  -- Record this session's view (upsert so the PK constraint holds on re-entry).
  insert into view_session_log (session_token, entity_type, entity_id, ip)
  values (p_session_token, p_type, p_id, nullif(v_ip, '')::inet)
  on conflict (session_token, entity_type, entity_id)
  do update set viewed_at = now(), ip = excluded.ip;

  -- Global view counter.
  insert into page_views (entity_type, entity_id, view_count)
  values (p_type, p_id, 1)
  on conflict (entity_type, entity_id)
  do update set view_count = page_views.view_count + 1;

  -- Daily rollup for the trending leaderboard (Taipei date).
  insert into page_view_daily (entity_type, entity_id, view_date, view_count)
  values (p_type, p_id, (now() at time zone 'Asia/Taipei')::date, 1)
  on conflict (entity_type, entity_id, view_date)
  do update set view_count = page_view_daily.view_count + 1;
end;
$function$;
