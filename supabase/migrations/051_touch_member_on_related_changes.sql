-- Bump members.updated_at whenever a related row (history, member_songs) changes,
-- so the member appears in the homepage "recent updates" section.
create or replace function touch_member_updated_at()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  update public.members
    set updated_at = now()
  where id = coalesce(NEW.member_id, OLD.member_id);
  return null;
end;
$$;

DO $$ BEGIN
  CREATE TRIGGER history_touch_member
    AFTER INSERT OR UPDATE OR DELETE ON history
    FOR EACH ROW EXECUTE FUNCTION touch_member_updated_at();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER member_songs_touch_member
    AFTER INSERT OR UPDATE OR DELETE ON member_songs
    FOR EACH ROW EXECUTE FUNCTION touch_member_updated_at();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
