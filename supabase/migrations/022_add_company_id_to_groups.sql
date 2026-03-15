-- supabase/migrations/022_add_company_id_to_groups.sql
ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS groups_company_id_idx ON groups(company_id);
