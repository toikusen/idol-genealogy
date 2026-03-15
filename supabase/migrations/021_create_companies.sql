-- supabase/migrations/021_create_companies.sql
CREATE TABLE IF NOT EXISTS companies (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  description  text,
  photo_url    text,
  color        text,
  instagram    text,
  facebook     text,
  x            text,
  youtube      text,
  website      text,
  founded_at   date,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Auto-update updated_at (moddatetime extension already enabled in migration 001)
CREATE OR REPLACE TRIGGER companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE PROCEDURE extensions.moddatetime(updated_at);

-- RLS
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "companies_select_public"
  ON companies FOR SELECT USING (true);

CREATE POLICY "companies_write_authenticated"
  ON companies FOR ALL
  USING (auth.uid() is not null)
  WITH CHECK (auth.uid() is not null);
