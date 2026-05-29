-- Migration 064: Paginated audit log RPC with composite keyset cursor,
-- date range, and member/group JSONB search.
-- Admin/editor-only; SECURITY DEFINER bypasses audit_log RLS.
-- Inline role check via user_roles + auth.email() enforces access control.
CREATE OR REPLACE FUNCTION get_audit_logs_paginated(
  p_table_name        text        DEFAULT NULL,
  p_operation         text        DEFAULT NULL,
  p_member_id         uuid        DEFAULT NULL,
  p_group_id          uuid        DEFAULT NULL,
  p_date_from         timestamptz DEFAULT NULL,
  p_date_to           timestamptz DEFAULT NULL,  -- exclusive upper bound (caller adds 1 day for inclusive date)
  p_cursor_created_at timestamptz DEFAULT NULL,
  p_cursor_id         uuid        DEFAULT NULL,
  p_limit             int         DEFAULT 51
)
RETURNS SETOF audit_log
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE email = auth.email()
      AND role IN ('admin', 'superadmin', 'editor')
  ) THEN
    RAISE EXCEPTION '無查詢變更記錄的權限';
  END IF;

  IF (p_cursor_created_at IS NULL) <> (p_cursor_id IS NULL) THEN
    RAISE EXCEPTION 'cursor fields must both be null or both be non-null';
  END IF;

  RETURN QUERY
  SELECT *
  FROM audit_log
  WHERE
    (p_table_name IS NULL OR table_name = p_table_name)
    AND (p_operation IS NULL OR operation = p_operation)
    AND (p_date_from IS NULL OR created_at >= p_date_from)
    AND (p_date_to   IS NULL OR created_at <  p_date_to)
    AND (
      p_cursor_created_at IS NULL
      OR created_at < p_cursor_created_at
      OR (created_at = p_cursor_created_at AND id < p_cursor_id)
    )
    -- member_id values in old_data/new_data come from the audit trigger and are always valid UUIDs
    AND (
      p_member_id IS NULL
      OR record_id = p_member_id
      OR (old_data->>'member_id')::uuid = p_member_id
      OR (new_data->>'member_id')::uuid = p_member_id
    )
    -- group_id values in old_data/new_data come from the audit trigger and are always valid UUIDs
    AND (
      p_group_id IS NULL
      OR record_id = p_group_id
      OR (old_data->>'group_id')::uuid = p_group_id
      OR (new_data->>'group_id')::uuid = p_group_id
    )
  ORDER BY created_at DESC, id DESC
  LIMIT least(greatest(p_limit, 1), 101);
END;
$$;

REVOKE ALL ON FUNCTION get_audit_logs_paginated(
  text, text, uuid, uuid, timestamptz, timestamptz, timestamptz, uuid, int
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION get_audit_logs_paginated(
  text, text, uuid, uuid, timestamptz, timestamptz, timestamptz, uuid, int
) TO authenticated;

CREATE INDEX IF NOT EXISTS audit_log_created_at_id_idx
  ON audit_log (created_at DESC, id DESC);
