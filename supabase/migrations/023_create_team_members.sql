-- supabase/migrations/023_create_team_members.sql

CREATE TABLE IF NOT EXISTS team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  bio text,
  photo_url text,
  instagram text,
  x text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "team_members_select_public"
  ON team_members FOR SELECT
  USING (true);

-- Authenticated write (editor + admin)
CREATE POLICY "team_members_write_authenticated"
  ON team_members FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Auto-update updated_at
CREATE OR REPLACE TRIGGER team_members_updated_at
  BEFORE UPDATE ON team_members
  FOR EACH ROW EXECUTE PROCEDURE extensions.moddatetime(updated_at);
