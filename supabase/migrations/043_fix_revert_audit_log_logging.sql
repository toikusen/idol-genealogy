-- Migration 043: Fix revert_audit_log to produce consistent audit entries
-- Problem: the DELETE/UPDATE/INSERT triggered by revert_audit_log fires log_changes(),
-- but auth.email() behaves inconsistently inside nested SECURITY DEFINER calls —
-- admin reverts get a log entry, editor reverts do not.
-- Fix: suppress table triggers during the revert, then write one explicit audit entry.
-- This guarantees identical behavior regardless of caller role.

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

  -- Suppress audit triggers so we write exactly one explicit log entry below,
  -- avoiding duplicate entries for admins (whose trigger was already working).
  set local session_replication_role = replica;

  if v_log.operation = 'INSERT' then
    -- Revert INSERT → delete the record
    execute format('delete from %I where id = $1', v_log.table_name)
      using v_log.record_id;

  elsif v_log.operation = 'UPDATE' then
    -- Revert UPDATE → restore all columns from old_data
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
    -- Revert DELETE → re-insert old_data
    execute format(
      'insert into %1$I select * from jsonb_populate_record(null::%1$I, $1)',
      v_log.table_name
    ) using v_log.old_data;
  end if;

  set local session_replication_role = default;

  -- Write one explicit audit entry that mirrors what the trigger would have written.
  -- For a reverted INSERT (→ DELETE): old_data = what existed, new_data = null
  -- For a reverted UPDATE (→ UPDATE): old_data = what it was, new_data = restored value
  -- For a reverted DELETE (→ INSERT): old_data = null, new_data = re-inserted row
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
