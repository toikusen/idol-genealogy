-- Migration 036: add user_role_id to team_members for reliable editor self-edit
-- Replaces fragile name-matching with a proper FK to user_roles.

-- 1. Add column
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS user_role_id uuid REFERENCES user_roles(id) ON DELETE SET NULL;

-- 2. RLS: editors can UPDATE the team_member row that links to their own user_role
DROP POLICY IF EXISTS "team_members_editor_self_update" ON team_members;
CREATE POLICY "team_members_editor_self_update"
  ON team_members FOR UPDATE
  USING (
    user_role_id IN (
      SELECT id FROM user_roles WHERE email = auth.email() AND role = 'editor'
    )
  )
  WITH CHECK (
    user_role_id IN (
      SELECT id FROM user_roles WHERE email = auth.email() AND role = 'editor'
    )
  );

-- 3. Trigger: keep team_members.name in sync when user_roles.display_name changes
CREATE OR REPLACE FUNCTION sync_team_member_name_on_display_name_change()
RETURNS trigger AS $$
BEGIN
  IF NEW.display_name IS DISTINCT FROM OLD.display_name
     AND NEW.display_name IS NOT NULL THEN
    UPDATE team_members
      SET name = NEW.display_name
      WHERE user_role_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_team_member_name ON user_roles;
CREATE TRIGGER trg_sync_team_member_name
  AFTER UPDATE ON user_roles
  FOR EACH ROW EXECUTE FUNCTION sync_team_member_name_on_display_name_change();
