-- Bump members.updated_at whenever a related row (history, member_songs) changes,
-- so the member appears in the homepage "recent updates" section.
create or replace function touch_member_updated_at()
returns trigger language plpgsql security definer as $$
begin
  update members
    set updated_at = now()
  where id = coalesce(NEW.member_id, OLD.member_id);
  return null;
end;
$$;

create trigger history_touch_member
  after insert or update or delete on history
  for each row execute function touch_member_updated_at();

create trigger member_songs_touch_member
  after insert or update or delete on member_songs
  for each row execute function touch_member_updated_at();
