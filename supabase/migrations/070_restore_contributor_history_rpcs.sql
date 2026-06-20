-- Restore contributor/edit-history RPCs that the frontend depends on.
-- These functions intentionally omit submitter_email while bypassing proposals RLS.

ALTER TABLE proposals DROP CONSTRAINT IF EXISTS proposals_table_name_check;
ALTER TABLE proposals ADD CONSTRAINT proposals_table_name_check
  CHECK (table_name IN (
    'members', 'groups', 'history', 'companies', 'venues',
    'member_songs', 'group_songs'
  ));

CREATE INDEX IF NOT EXISTS proposals_approved_record_idx
  ON proposals (table_name, record_id, status, reviewed_at DESC)
  WHERE status = 'approved';

CREATE OR REPLACE FUNCTION get_approved_by_record(
  p_table_name text,
  p_record_id uuid
)
RETURNS TABLE (
  id             uuid,
  table_name     text,
  record_id      uuid,
  operation      text,
  proposed_data  jsonb,
  original_data  jsonb,
  reviewed_data  jsonb,
  status         text,
  reviewed_at    timestamptz,
  submitter_id   uuid,
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

CREATE OR REPLACE FUNCTION get_approved_songs_by_field(
  p_table_name text,
  p_field text,
  p_value uuid
)
RETURNS TABLE (
  id             uuid,
  table_name     text,
  record_id      uuid,
  operation      text,
  proposed_data  jsonb,
  original_data  jsonb,
  reviewed_data  jsonb,
  status         text,
  reviewed_at    timestamptz,
  submitter_id   uuid,
  submitter_name text
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    id, table_name, record_id, operation,
    proposed_data, original_data, reviewed_data,
    status, reviewed_at, submitter_id, submitter_name
  FROM proposals
  WHERE table_name = p_table_name
    AND table_name IN ('member_songs', 'group_songs')
    AND status = 'approved'
    AND (
      (proposed_data  ->> p_field)::uuid = p_value
      OR (original_data ->> p_field)::uuid = p_value
    )
  ORDER BY reviewed_at DESC;
$$;

CREATE INDEX IF NOT EXISTS proposals_member_songs_member_id_idx
  ON proposals ((proposed_data ->> 'member_id'))
  WHERE table_name = 'member_songs' AND status = 'approved';

CREATE INDEX IF NOT EXISTS proposals_group_songs_group_id_idx
  ON proposals ((proposed_data ->> 'group_id'))
  WHERE table_name = 'group_songs' AND status = 'approved';

CREATE OR REPLACE FUNCTION get_leaderboard()
RETURNS TABLE (
  submitter_id   uuid,
  submitter_name text,
  total          bigint,
  by_table       jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    sub.submitter_id,
    (
      SELECT COALESCE(NULLIF(p2.submitter_name, ''), '匿名貢獻者')
      FROM proposals p2
      WHERE p2.submitter_id = sub.submitter_id
        AND p2.status = 'approved'
      ORDER BY p2.reviewed_at DESC
      LIMIT 1
    ) AS submitter_name,
    SUM(sub.cnt)::bigint AS total,
    jsonb_object_agg(sub.table_name, sub.cnt ORDER BY sub.table_name) AS by_table
  FROM (
    SELECT
      submitter_id,
      table_name,
      COUNT(*) AS cnt
    FROM proposals
    WHERE status = 'approved'
      AND submitter_id IS NOT NULL
    GROUP BY submitter_id, table_name
  ) sub
  GROUP BY sub.submitter_id
  ORDER BY total DESC, sub.submitter_id ASC;
$$;
