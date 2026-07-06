-- Security Advisor follow-up (2026-07 review).
-- Fixes real holes found in the policy dump and pins function search_path
-- to satisfy the linter. Songs' "auth insert"/"creator update" policies are
-- intentional (community feature on public pages) and are NOT touched.

-- ── 1. Over-broad write policies (any logged-in Google account could write) ──

-- companies: permissive ALL policy let any authenticated user write/delete.
DROP POLICY IF EXISTS "companies_write_authenticated" ON companies;

-- venues: ALL policy for any authenticated user made 049/081 pointless.
DROP POLICY IF EXISTS "Staff can manage venues" ON venues;

-- venues: duplicate SELECT policy; the broad `true` one makes the is_active
-- filter ineffective anyway. Keep current behavior (public read of all rows).
DROP POLICY IF EXISTS "Venues are publicly readable" ON venues;

-- group_videos: writes only happen from the staff admin UI; editor/admin
-- policies already cover that. These any-auth leftovers let anyone write.
DROP POLICY IF EXISTS "auth users can insert group_videos" ON group_videos;
DROP POLICY IF EXISTS "auth users can update group_videos" ON group_videos;

-- ── 2. user_roles: block admin → superadmin self-escalation ──
-- Old policies allowed any admin to INSERT/UPDATE rows with role='superadmin'
-- (including their own row). Now: superadmin manages everything, admins may
-- only manage editor rows.

DROP POLICY IF EXISTS "admins can insert user_roles" ON user_roles;
CREATE POLICY "admins can insert user_roles" ON user_roles
  FOR INSERT WITH CHECK (
    is_superadmin() OR (is_admin() AND role = 'editor')
  );

DROP POLICY IF EXISTS "admins can update user_roles" ON user_roles;
CREATE POLICY "admins can update user_roles" ON user_roles
  FOR UPDATE
  USING (is_superadmin() OR (is_admin() AND role = 'editor'))
  WITH CHECK (is_superadmin() OR (is_admin() AND role = 'editor'));

-- ── 3. insert_approved_proposal: require staff, not just any session ──
-- Any logged-in user could insert pre-approved proposal rows attributed to
-- '管理員', polluting the public edit history. Only staff perform direct edits.

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

  IF NOT is_staff() THEN
    RAISE EXCEPTION 'insert_approved_proposal: staff role required';
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

-- ── 4. Pin search_path on every function the linter flagged ──
-- Bodies use unqualified public-schema names, so pin to public (not '').
DO $$
DECLARE fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'get_history_audit_logs_by_field', 'get_songs_audit_logs_by_field',
        'handle_updated_at', 'get_approved_history_by_field',
        'get_approved_by_record', 'revert_audit_log', 'log_changes',
        'sync_team_member_name_on_display_name_change', 'is_staff',
        'trg_fn_groups_disbanded_announced_at',
        'cleanup_favorites_on_group_delete', 'cleanup_favorites_on_member_delete',
        'proposal_rate_limit_ok', 'get_top_members_by_views',
        'get_top_groups_by_views', 'is_admin', 'is_superadmin',
        'get_own_role', 'get_approved_songs_by_field', 'get_leaderboard'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', fn.sig);
  END LOOP;
END $$;

-- ── 5. Trigger functions should not be callable via /rest/v1/rpc ──
-- EXECUTE is only checked when the trigger is created, so triggers keep firing.
DO $$
DECLARE fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'log_changes', 'handle_updated_at', 'touch_group_on_songs_change',
        'touch_member_updated_at', 'sync_team_member_name_on_display_name_change',
        'cleanup_favorites_on_group_delete', 'cleanup_favorites_on_member_delete',
        'trg_fn_groups_disbanded_announced_at'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.sig);
  END LOOP;
END $$;

-- ── 6. Staff-only RPCs: at minimum not callable anonymously ──
-- (They already check the caller's role internally; this is defense in depth.
-- Keep is_admin/is_staff/is_superadmin/get_own_role executable — RLS policies
-- evaluate them as the calling role.)
REVOKE EXECUTE ON FUNCTION revert_audit_log(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION insert_approved_proposal(text, uuid, text, jsonb, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION get_audit_logs_paginated(text, text, uuid, uuid, timestamptz, timestamptz, timestamptz, uuid, integer) FROM anon;

-- ── 7. Storage: public bucket doesn't need a listing policy ──
-- Object URLs on public buckets bypass RLS; the app never calls .list().
DROP POLICY IF EXISTS "Public read member-photos" ON storage.objects;
