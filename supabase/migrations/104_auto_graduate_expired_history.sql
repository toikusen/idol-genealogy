-- Migration 104: auto-flip history rows to 'graduated' once left_at has passed.
--
-- Editors announce a graduation early by filling in left_at while status stays
-- 'active' (the member is still in the group until that date). Until now the
-- flip to 'graduated' had to be done by hand on the day, and it was routinely
-- forgotten — 20 rows were overdue when this migration was written.
--
-- Only 'active' is auto-flipped. 'support' / 'hiatus' rows also carry a left_at
-- but it means "the support stint / hiatus ended", not a graduation.
--
-- ponytail: always 'graduated', no per-row target-status column. left_at alone
-- cannot distinguish graduated / withdrawn / transferred; those are rare and an
-- editor fixes them by hand. Add a pending_status column if that stops being true.

create or replace function public.auto_graduate_expired_history()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  -- The audit trigger (log_changes) stamps rows with auth.email(), which is
  -- NULL under pg_cron. Give it a recognisable identity instead so the admin
  -- audit log can label these edits "系統自動".
  perform set_config('request.jwt.claims', '{"email":"system@auto"}', true);

  update history
     set status = 'graduated'
   where status = 'active'
     and left_at is not null
     and left_at < (now() at time zone 'Asia/Taipei')::date;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.auto_graduate_expired_history() from public;

-- 16:05 UTC = 00:05 Asia/Taipei — the day AFTER left_at, since left_at is the
-- member's last active day.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('auto-graduate-expired', '5 16 * * *',
                        'select auto_graduate_expired_history()');
exception when others then
  raise notice 'pg_cron unavailable (%) — call auto_graduate_expired_history() by other means', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- One-time backfill of the already-overdue rows.
--
-- The Supabase Database Webhook on history fires notify-status-change, which
-- pushes "從《X》畢業" to subscribers. Some of these graduations are months old,
-- so the webhook trigger is disabled for the backfill only. The audit trigger
-- stays on: the backfill IS recorded in the admin audit log.
-- ---------------------------------------------------------------------------
do $$
declare
  t record;
  h text;
  hooks text[] := '{}';
begin
  for t in
    select tr.tgname
      from pg_trigger tr
      join pg_class c on c.oid = tr.tgrelid
     where c.relname = 'history'
       and not tr.tgisinternal
       and pg_get_triggerdef(tr.oid) ilike '%http_request%'
  loop
    hooks := hooks || t.tgname;
    execute format('alter table history disable trigger %I', t.tgname);
  end loop;

  raise notice 'backfilled % row(s), webhook triggers suspended: %',
    auto_graduate_expired_history(), hooks;

  foreach h in array hooks loop
    execute format('alter table history enable trigger %I', h);
  end loop;
end $$;
