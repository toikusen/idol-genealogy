-- RPC: get audit_log entries for history records where member_id or group_id matches.
-- Used by the edit history panel to show all changes to history records (including
-- direct admin edits that bypass the proposal system).
-- SECURITY DEFINER bypasses audit_log RLS so this can be called by any authenticated
-- or anonymous user. user_email is deliberately excluded for privacy.
CREATE OR REPLACE FUNCTION get_history_audit_logs_by_field(
  p_field text,
  p_value uuid
)
RETURNS TABLE (
  id         uuid,
  table_name text,
  record_id  uuid,
  operation  text,
  old_data   jsonb,
  new_data   jsonb,
  created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id, table_name, record_id, operation, old_data, new_data, created_at
  FROM audit_log
  WHERE table_name = 'history'
    AND (
      (new_data ->> p_field)::uuid = p_value
      OR (old_data  ->> p_field)::uuid = p_value
    )
  ORDER BY created_at DESC;
$$;

CREATE INDEX IF NOT EXISTS audit_log_history_member_id_idx
  ON audit_log ((new_data ->> 'member_id'))
  WHERE table_name = 'history';

CREATE INDEX IF NOT EXISTS audit_log_history_group_id_idx
  ON audit_log ((new_data ->> 'group_id'))
  WHERE table_name = 'history';
