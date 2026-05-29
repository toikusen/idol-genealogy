-- Migration 044: Fix revert_audit_log permissions error on Supabase Cloud
-- Problem: SET LOCAL session_replication_role requires superuser; Supabase postgres role
--          is not a superuser, so migration 043's function throws 403 / code 42501.
-- Fix: use a transaction-local custom GUC (app.suppress_audit) to signal the trigger
--      to skip logging. Custom GUCs are settable by any role, no superuser needed.

-- Step 1: patch log_changes() to honour the suppress flag
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

-- Step 2: patch revert_audit_log() to use set_config instead of session_replication_role
create or replace function revert_audit_log(p_log_id uuid)
returns void language plpgsql security definer as $$
declare
  v_log  audit_log%rowtype;
  v_cols text;
begin
  select * into v_log from audit_log where id = p_log_id;
  if not found then
    raise exception 'Audit log record not found';
  end if;

  -- Only admin/superadmin or the original operator may revert
  if not (
    exists (
      select 1 from user_roles
      where email = auth.email()
        and role in ('admin', 'superadmin')
    )
    or v_log.user_email = auth.email()
  ) then
    raise exception '無還原權限';
  end if;

  -- Suppress audit triggers for the duration of this transaction so we write
  -- exactly one explicit log entry below. set_config with is_local=true resets
  -- automatically at transaction end; no superuser required.
  perform set_config('app.suppress_audit', 'true', true);

  if v_log.operation = 'INSERT' then
    execute format('delete from %I where id = $1', v_log.table_name)
      using v_log.record_id;

  elsif v_log.operation = 'UPDATE' then
    select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into v_cols
    from information_schema.columns
    where table_schema = 'public'
      and table_name   = v_log.table_name
      and column_name != 'id';

    execute format(
      'update %1$I t set (%2$s) = (select %2$s from jsonb_populate_record(null::%1$I, $1)) where t.id = $2',
      v_log.table_name, v_cols
    ) using v_log.old_data, v_log.record_id;

  elsif v_log.operation = 'DELETE' then
    execute format(
      'insert into %1$I select * from jsonb_populate_record(null::%1$I, $1)',
      v_log.table_name
    ) using v_log.old_data;
  end if;

  -- Write one explicit audit entry for the revert action.
  insert into audit_log (table_name, record_id, operation, user_id, user_email, old_data, new_data)
  values (
    v_log.table_name,
    v_log.record_id,
    case v_log.operation
      when 'INSERT' then 'DELETE'
      when 'UPDATE' then 'UPDATE'
      when 'DELETE' then 'INSERT'
    end,
    auth.uid(),
    auth.email(),
    case v_log.operation
      when 'INSERT' then v_log.new_data
      when 'UPDATE' then v_log.new_data
      when 'DELETE' then null
    end,
    case v_log.operation
      when 'INSERT' then null
      when 'UPDATE' then v_log.old_data
      when 'DELETE' then v_log.old_data
    end
  );
end;
$$;

grant execute on function revert_audit_log(uuid) to authenticated;
