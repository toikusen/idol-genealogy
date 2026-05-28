-- Auto-remove user_favorites when the referenced group or member is hard-deleted.
-- user_favorites.entity_id is a polymorphic FK (entity_type determines the target table),
-- so we use triggers instead of a standard CASCADE FK constraint.

CREATE OR REPLACE FUNCTION cleanup_favorites_on_group_delete()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM user_favorites
  WHERE entity_type = 'group' AND entity_id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_cleanup_favorites_on_group_delete
  AFTER DELETE ON groups
  FOR EACH ROW EXECUTE FUNCTION cleanup_favorites_on_group_delete();

CREATE OR REPLACE FUNCTION cleanup_favorites_on_member_delete()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM user_favorites
  WHERE entity_type = 'member' AND entity_id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_cleanup_favorites_on_member_delete
  AFTER DELETE ON members
  FOR EACH ROW EXECUTE FUNCTION cleanup_favorites_on_member_delete();
