-- Migration 053: Suppress audit entries from touch_member_updated_at
-- touch_member_updated_at bumps members.updated_at for display ordering only.
-- That secondary UPDATE was firing members_audit, creating spurious entries
-- showing only "updated_at changed". Suppress all triggers during the silent touch.

create or replace function touch_member_updated_at()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  -- session_replication_role = replica suppresses default-mode triggers (members_audit,
  -- members_updated_at) so this housekeeping bump does not appear in the audit log.
  set local session_replication_role = replica;
  update public.members
    set updated_at = now()
  where id = coalesce(NEW.member_id, OLD.member_id);
  set local session_replication_role = default;
  return null;
end;
$$;
