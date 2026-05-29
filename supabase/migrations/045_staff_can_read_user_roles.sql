-- Migration 045: Allow all staff (editor/admin/superadmin) to read user_roles
-- Problem: editors could only read their own row (policy "users can read own profile"),
-- so the audit log operator name lookup only resolved their own email and fell back to
-- raw email for all other operators.
-- Fix: SECURITY DEFINER function to avoid RLS recursion, then a SELECT policy for staff.

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE email = auth.email()
      AND role IN ('editor', 'admin', 'superadmin')
  );
$$;

DO $$ BEGIN
  CREATE POLICY "staff can read user_roles" ON user_roles
    FOR SELECT USING (is_staff());
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
