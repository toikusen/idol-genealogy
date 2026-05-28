-- Migration 040: Allow editors to read audit_log
-- Editors need SELECT access to view change history at /admin/audit-log.
-- Revert is restricted at the app layer (editors can only revert their own changes).

DROP POLICY IF EXISTS "admins can read audit_log" ON audit_log;

CREATE POLICY "privileged can read audit_log" ON audit_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE email = auth.email()
        AND role IN ('admin', 'superadmin', 'editor')
    )
  );
