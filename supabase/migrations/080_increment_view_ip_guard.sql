-- Guard increment_view against token-rotation inflation.
--
-- The popularity board ranks by count(distinct session_token), but session
-- tokens are minted client-side (crypto.randomUUID) and the RPC is open to
-- anon, so an attacker can clear localStorage / script the endpoint to forge
-- unlimited "distinct visitors" for one entity. Add an IP-based dedup: count
-- at most one view per client IP per entity per 10-minute window, regardless
-- of how many tokens are presented. The real client IP is available from the
-- request headers (verified: cf-connecting-ip / x-forwarded-for both carry it
-- behind Supabase's Cloudflare front).
--
-- Also store the IP on each row so future abuse can be investigated by source.

alter table view_session_log add column if not exists ip inet;

create index if not exists idx_view_session_log_ip
  on view_session_log (entity_type, entity_id, ip, viewed_at);

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
begin
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
