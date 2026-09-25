-- Click tracking for the "其他人也看了" cards.
--
-- Everything measured so far describes the shape of the recommendations —
-- overlap between pages, how often a label renders — none of which says
-- whether readers actually follow them. This is the only thing that can.
--
-- Not folded into view_session_log: a click is a (from, to) pair, and that
-- table is keyed on a single entity. Storing pairs there would also pollute
-- the co-visit matrix that reads it.

create table if not exists related_click_log (
  session_token uuid        not null,
  from_group_id uuid        not null references groups(id) on delete cascade,
  to_group_id   uuid        not null references groups(id) on delete cascade,
  clicked_at    timestamptz not null default now(),
  -- One row per session per pair: repeat clicks by the same reader are not a
  -- stronger signal, and this keeps the table small without a cleanup job.
  primary key (session_token, from_group_id, to_group_id)
);

create index if not exists idx_related_click_from
  on related_click_log (from_group_id, clicked_at);

alter table related_click_log enable row level security;

-- Writes go through log_related_click, reads through the SQL editor.
drop policy if exists related_click_log_no_direct_access on related_click_log;
create policy related_click_log_no_direct_access on related_click_log
  for all using (false) with check (false);

create or replace function public.log_related_click(
  p_from_group_id uuid,
  p_to_group_id   uuid,
  p_session_token uuid
)
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
  -- Same crawler guard as increment_view: a bot following every link would
  -- report a click-through rate near 100%.
  if v_ip <> '' and is_crawler_ip(v_ip::inet) then
    return;
  end if;

  insert into related_click_log (session_token, from_group_id, to_group_id)
  values (p_session_token, p_from_group_id, p_to_group_id)
  on conflict do nothing;
end;
$function$;

revoke all on function public.log_related_click(uuid, uuid, uuid) from public;
grant execute on function public.log_related_click(uuid, uuid, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reading the results
-- ---------------------------------------------------------------------------
-- No reporting RPC: this gets read a handful of times while deciding whether
-- the feature earns its place, not by the app. Paste into the SQL editor.
--
-- Impressions are approximated by sessions that viewed the source group —
-- there is no separate impression event. The carousel sits below the fold and
-- shows 2-4 of its 12 cards at a time, so the true denominator is smaller and
-- these rates are a floor, not the real click-through rate. Compare them
-- against each other over time; do not read them as absolute.
--
--   -- overall
--   select count(*) filter (where c.session_token is not null)::numeric
--          / nullif(count(*), 0) as click_rate
--   from view_session_log v
--   left join related_click_log c
--     on c.session_token = v.session_token and c.from_group_id = v.entity_id
--   where v.entity_type = 'group'
--     and v.viewed_at > now() - interval '30 days';
--
--   -- does the shared-member label get clicked more? run get_related_groups
--   -- for the source group to see which targets carried a label.
--   select g.name as target, count(*) as clicks
--   from related_click_log c
--   join groups g on g.id = c.to_group_id
--   where c.clicked_at > now() - interval '30 days'
--   group by g.name
--   order by clicks desc
--   limit 20;
