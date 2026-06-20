-- Migration 072: SECURITY DEFINER RPC for admin direct-edit proposals
-- Replaces the direct table INSERT in recordDirectEdit() which was subject to the
-- proposals RLS rate-limit policy.  When the Supabase JS client's lock-bypass causes
-- a token-refresh race and getSession() transiently returns null, the direct INSERT
-- fails after 5 null-submitter_id rows within 10 minutes.  Using SECURITY DEFINER
-- bypasses table RLS while still enforcing auth via auth.uid() from the request JWT.

CREATE OR REPLACE FUNCTION insert_approved_proposal(
  p_table_name    text,
  p_record_id     uuid,
  p_operation     text,
  p_proposed_data jsonb,
  p_original_data jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'insert_approved_proposal: authentication required';
  END IF;

  IF p_table_name NOT IN (
    'members', 'groups', 'history', 'companies', 'venues',
    'member_songs', 'group_songs'
  ) THEN
    RAISE EXCEPTION 'insert_approved_proposal: invalid table_name %', p_table_name;
  END IF;

  IF p_operation NOT IN ('INSERT', 'UPDATE', 'DELETE') THEN
    RAISE EXCEPTION 'insert_approved_proposal: invalid operation %', p_operation;
  END IF;

  INSERT INTO proposals (
    table_name, record_id, operation,
    proposed_data, original_data,
    status, submitter_name, submitter_id,
    reviewed_at, reviewed_by
  ) VALUES (
    p_table_name, p_record_id, p_operation,
    p_proposed_data, p_original_data,
    'approved', '管理員', auth.uid(),
    NOW(), auth.uid()
  );
END;
$$;
