-- Add user_id column (nullable so existing rows aren't broken)
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Drop the old blanket write policy
DROP POLICY IF EXISTS "team_members_write_authenticated" ON team_members;

-- Self-edit: authenticated user can INSERT/UPDATE/DELETE their own rows
CREATE POLICY "team_members_self_write"
  ON team_members FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Superadmin bypass: the hardcoded superadmin email can edit everything
CREATE POLICY "team_members_superadmin_write"
  ON team_members FOR ALL
  USING ((auth.jwt() ->> 'email') = 'tuyucheng0407@gmail.com')
  WITH CHECK ((auth.jwt() ->> 'email') = 'tuyucheng0407@gmail.com');
