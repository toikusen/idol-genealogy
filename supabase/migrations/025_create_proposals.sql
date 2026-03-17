-- supabase/migrations/025_create_proposals.sql
-- Apply manually in Supabase Dashboard SQL Editor

-- ============================================================
-- 1. proposals table
-- ============================================================
CREATE TABLE proposals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name      TEXT NOT NULL CHECK (table_name IN ('members', 'groups', 'history', 'companies')),
  record_id       UUID,
  -- NULL = INSERT proposal; non-null = UPDATE proposal
  operation       TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE')),
  proposed_data   JSONB NOT NULL,
  original_data   JSONB,
  -- snapshot of original record at time of submission (null for INSERT)
  reviewed_data   JSONB,
  -- admin may edit before approving; this overrides proposed_data on approve
  submitter_id    UUID REFERENCES auth.users(id),
  submitter_name  TEXT NOT NULL,
  -- required even for anonymous (they self-enter a nickname)
  submitter_email TEXT,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewer_note   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at     TIMESTAMPTZ,
  reviewed_by     UUID REFERENCES auth.users(id)
);

-- Index for admin list queries
CREATE INDEX ON proposals (status, created_at ASC);
CREATE INDEX ON proposals (submitter_id) WHERE submitter_id IS NOT NULL;

-- ============================================================
-- 2. RLS policies
-- ============================================================
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon) can submit proposals
-- submitter_id must be null (anonymous) or match the calling user
CREATE POLICY "anyone can submit proposals" ON proposals
  FOR INSERT WITH CHECK (
    submitter_id IS NULL OR submitter_id = auth.uid()
  );

-- Logged-in users can see their own proposals
CREATE POLICY "users can view own proposals" ON proposals
  FOR SELECT USING (
    auth.uid() IS NOT NULL AND submitter_id = auth.uid()
  );

-- Admin/superadmin can see all proposals
CREATE POLICY "admins can view all proposals" ON proposals
  FOR SELECT USING (is_admin());

-- Admin/superadmin can update proposals (review workflow)
CREATE POLICY "admins can update proposals" ON proposals
  FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());

-- Superadmin can delete proposals
CREATE POLICY "superadmin can delete proposals" ON proposals
  FOR DELETE USING (is_superadmin());
