-- supabase/migrations/026_contributor_features.sql

-- Performance index for footer query (table_name, record_id, status, reviewed_at)
CREATE INDEX IF NOT EXISTS proposals_approved_record_idx
  ON proposals (table_name, record_id, status, reviewed_at DESC)
  WHERE status = 'approved';

-- RPC: get all approved proposals for a specific record (newest first)
-- Uses SECURITY DEFINER so anonymous users can call it without RLS bypass.
-- Explicitly excludes submitter_email for privacy.
CREATE OR REPLACE FUNCTION get_approved_by_record(
  p_table_name text,
  p_record_id  uuid
)
RETURNS TABLE (
  id           uuid,
  table_name   text,
  record_id    uuid,
  operation    text,
  proposed_data  jsonb,
  original_data  jsonb,
  reviewed_data  jsonb,
  status       text,
  reviewed_at  timestamptz,
  submitter_id uuid,
  submitter_name text
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    id, table_name, record_id, operation,
    proposed_data, original_data, reviewed_data,
    status, reviewed_at, submitter_id, submitter_name
  FROM proposals
  WHERE table_name = p_table_name
    AND record_id  = p_record_id
    AND status     = 'approved'
  ORDER BY reviewed_at DESC;
$$;

-- RPC: leaderboard — logged-in contributors ranked by approved proposal count
-- Resolves submitter_name from the most recent approved proposal per user.
-- Uses SECURITY DEFINER so anonymous users can call it.
CREATE OR REPLACE FUNCTION get_leaderboard()
RETURNS TABLE (
  submitter_id   uuid,
  submitter_name text,
  total          bigint,
  by_table       jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    submitter_id,
    (
      SELECT p2.submitter_name
      FROM proposals p2
      WHERE p2.submitter_id = sub.submitter_id
        AND p2.status = 'approved'
      ORDER BY p2.reviewed_at DESC
      LIMIT 1
    ) AS submitter_name,
    SUM(sub.cnt) AS total,
    jsonb_object_agg(sub.table_name, sub.cnt) AS by_table
  FROM (
    SELECT submitter_id, table_name, COUNT(*) AS cnt
    FROM proposals
    WHERE status = 'approved'
      AND submitter_id IS NOT NULL
    GROUP BY submitter_id, table_name
  ) sub
  GROUP BY submitter_id
  ORDER BY total DESC, submitter_id ASC;
$$;
