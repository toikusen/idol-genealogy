-- Migration 042: RPC for reverting audit log entries
-- Allows editors to revert their own INSERT operations, which otherwise require
-- DELETE permission that editors do not have. security definer bypasses RLS;
-- authorization (admin or own operation) is enforced inside the function.

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

  if v_log.operation = 'INSERT' then
    -- Revert INSERT → delete the record
    execute format('delete from %I where id = $1', v_log.table_name)
      using v_log.record_id;

  elsif v_log.operation = 'UPDATE' then
    -- Revert UPDATE → restore all columns from old_data using jsonb_populate_record
    -- so that NULL values are handled correctly (not cast to the string 'NULL')
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
end;
$$;

-- Allow authenticated users to call this RPC;
-- the authorization check inside the function enforces who can actually revert.
grant execute on function revert_audit_log(uuid) to authenticated;
