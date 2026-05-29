-- RPC: get approved history proposals where proposed_data->>{field} matches a given UUID.
-- Used by the edit history panel on member/group pages to show related history changes.
-- Uses SECURITY DEFINER to bypass RLS (same pattern as get_approved_by_record).
-- Excludes submitter_email for privacy.
CREATE OR REPLACE FUNCTION get_approved_history_by_field(
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
  WHERE table_name = 'history'
    AND status     = 'approved'
    AND (
      (proposed_data  ->> p_field)::uuid = p_value
      OR (original_data ->> p_field)::uuid = p_value
    )
  ORDER BY reviewed_at DESC;
$$;

CREATE INDEX IF NOT EXISTS proposals_history_member_id_idx
  ON proposals ((proposed_data ->> 'member_id'))
  WHERE table_name = 'history' AND status = 'approved';

CREATE INDEX IF NOT EXISTS proposals_history_group_id_idx
  ON proposals ((proposed_data ->> 'group_id'))
  WHERE table_name = 'history' AND status = 'approved';
