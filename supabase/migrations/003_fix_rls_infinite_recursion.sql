-- supabase/migrations/003_fix_rls_infinite_recursion.sql
-- Apply manually in Supabase Dashboard SQL Editor
--
-- Fix: The original policies used EXISTS (SELECT 1 FROM user_roles WHERE ...)
-- directly inside user_roles' own policies, causing infinite recursion (code 42P17).
-- Solution: a SECURITY DEFINER function that bypasses RLS when checking admin status.

-- ============================================================
-- 1. Create is_admin() — reads user_roles bypassing RLS
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE email = auth.email() AND role = 'admin'
  );
$$;

-- ============================================================
-- 2. Rebuild user_roles policies using is_admin()
-- ============================================================
DROP POLICY IF EXISTS "admins can read user_roles" ON user_roles;
DROP POLICY IF EXISTS "admins can insert user_roles" ON user_roles;
DROP POLICY IF EXISTS "admins can update user_roles" ON user_roles;
DROP POLICY IF EXISTS "admins can delete user_roles" ON user_roles;

CREATE POLICY "admins can read user_roles" ON user_roles
  FOR SELECT USING (is_admin());
CREATE POLICY "admins can insert user_roles" ON user_roles
  FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "admins can update user_roles" ON user_roles
  FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admins can delete user_roles" ON user_roles
  FOR DELETE USING (is_admin());

-- ============================================================
-- 3. Rebuild audit_log SELECT policy
-- ============================================================
DROP POLICY IF EXISTS "admins can read audit_log" ON audit_log;
CREATE POLICY "admins can read audit_log" ON audit_log
  FOR SELECT USING (is_admin());

-- ============================================================
-- 4. Rebuild DELETE policies on data tables
-- ============================================================
DROP POLICY IF EXISTS "admins can delete members" ON members;
DROP POLICY IF EXISTS "admins can delete groups" ON groups;
DROP POLICY IF EXISTS "admins can delete teams" ON teams;
DROP POLICY IF EXISTS "admins can delete history" ON history;

CREATE POLICY "admins can delete members" ON members
  FOR DELETE USING (is_admin());
CREATE POLICY "admins can delete groups" ON groups
  FOR DELETE USING (is_admin());
CREATE POLICY "admins can delete teams" ON teams
  FOR DELETE USING (is_admin());
CREATE POLICY "admins can delete history" ON history
  FOR DELETE USING (is_admin());
