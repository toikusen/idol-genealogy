-- Migration 054: Fix touch_member_updated_at using set_config instead of session_replication_role
-- session_replication_role requires superuser and causes 403 on member_songs INSERT.
-- Replace with a custom session flag that log_changes() checks to skip audit.

-- Update log_changes to skip audit when the suppress flag is set
create or replace function log_changes()
returns trigger as $$
begin
  if current_setting('app.suppress_audit', true) = 'true' then
    return null;
  end if;
  insert into audit_log (table_name, record_id, operation, user_id, user_email, old_data, new_data)
  values (
    tg_table_name,
    coalesce(new.id, old.id),
    tg_op,
    auth.uid(),
    auth.email(),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return null;
end;
$$ language plpgsql security definer;

-- Update touch_member_updated_at to use set_config flag instead of session_replication_role
create or replace function touch_member_updated_at()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  perform set_config('app.suppress_audit', 'true', true);
  update public.members
    set updated_at = now()
  where id = coalesce(NEW.member_id, OLD.member_id);
  perform set_config('app.suppress_audit', 'false', true);
  return null;
end;
$$;
