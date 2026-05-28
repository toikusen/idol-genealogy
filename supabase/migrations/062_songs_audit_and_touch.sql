-- Migration 062: Add audit triggers to member_songs/group_songs,
-- add touch_group trigger for group_songs,
-- and add RPC to fetch song audit_log entries by field.

-- ── 1. Audit triggers ──────────────────────────────────────────────────────────
-- member_songs: fires alphabetically before member_songs_touch_member,
-- so suppress_audit is still false when log_changes() runs.
DO $$ BEGIN
  CREATE TRIGGER member_songs_audit
    AFTER INSERT OR UPDATE OR DELETE ON member_songs
    FOR EACH ROW EXECUTE FUNCTION log_changes();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER group_songs_audit
    AFTER INSERT OR UPDATE OR DELETE ON group_songs
    FOR EACH ROW EXECUTE FUNCTION log_changes();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 2. Touch groups.updated_at when group_songs changes ───────────────────────
CREATE OR REPLACE FUNCTION touch_group_on_songs_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.suppress_audit', 'true', true);
  UPDATE public.groups
    SET updated_at = now()
  WHERE id = coalesce(NEW.group_id, OLD.group_id);
  PERFORM set_config('app.suppress_audit', 'false', true);
  RETURN NULL;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER group_songs_touch_group
    AFTER INSERT OR UPDATE OR DELETE ON group_songs
    FOR EACH ROW EXECUTE FUNCTION touch_group_on_songs_change();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 3. RPC: get audit_log entries for a songs table by member_id or group_id ──
-- Used by the edit history panel to show song add/edit/delete events.
-- SECURITY DEFINER bypasses audit_log RLS; user_email is excluded for privacy.
CREATE OR REPLACE FUNCTION get_songs_audit_logs_by_field(
  p_table text,
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
  WHERE table_name = p_table
    AND (
      (new_data ->> p_field)::uuid = p_value
      OR (old_data  ->> p_field)::uuid = p_value
    )
  ORDER BY created_at DESC;
$$;
