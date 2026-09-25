-- Migration 097: let non-staff song edits back into the edit history, under their own name
-- Song editing on member/group pages is open to any logged-in user (canEditSong:
-- own rows), but migration 082 made insert_approved_proposal staff-only, so since
-- 2026-07-06 those edits silently recorded nothing — no edit history, no contribution.
-- Now: non-staff may log member_songs/group_songs edits only (082's block stays for
-- every other table), and their row carries their own name instead of '管理員'.
-- Worst case abuse is noise in one song's edit history; the song data itself is still
-- governed by the member_songs/group_songs RLS policies.

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
DECLARE
  v_is_staff boolean := is_staff();
  v_name     text;
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

  IF NOT v_is_staff AND p_table_name NOT IN ('member_songs', 'group_songs') THEN
    RAISE EXCEPTION 'insert_approved_proposal: staff role required for %', p_table_name;
  END IF;

  IF v_is_staff THEN
    v_name := '管理員';
  ELSE
    SELECT p.submitter_name INTO v_name
    FROM proposals p
    WHERE p.submitter_id = auth.uid()
      AND COALESCE(p.submitter_name, '') NOT IN ('', '管理員')
    ORDER BY p.reviewed_at DESC NULLS LAST, p.created_at DESC
    LIMIT 1;
    v_name := COALESCE(v_name, '匿名貢獻者');
  END IF;

  INSERT INTO proposals (
    table_name, record_id, operation,
    proposed_data, original_data,
    status, submitter_name, submitter_id,
    reviewed_at, reviewed_by
  ) VALUES (
    p_table_name, p_record_id, p_operation,
    p_proposed_data, p_original_data,
    'approved', v_name, auth.uid(),
    NOW(), auth.uid()
  );
END;
$$;
