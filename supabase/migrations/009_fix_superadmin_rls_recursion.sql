-- Migration 009: 修復 008 造成的 RLS 無限遞迴
-- 根本原因：008 在 user_roles 的 policy 裡直接 SELECT user_roles，觸發遞迴
-- 解法：改用 SECURITY DEFINER function（同 003 的修法）

-- ============================================================
-- 1. 更新 is_admin()：admin 或 superadmin 皆回傳 true
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE email = auth.email() AND role IN ('admin', 'superadmin')
  );
$$;

-- ============================================================
-- 2. 新增 is_superadmin()：只限系統管理員
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT auth.email() = 'tuyucheng0407@gmail.com';
$$;

-- ============================================================
-- 3. 重建 user_roles policies（移除 008 留下的遞迴 policy）
-- ============================================================
DROP POLICY IF EXISTS "privileged can read user_roles"   ON user_roles;
DROP POLICY IF EXISTS "privileged can insert user_roles" ON user_roles;
DROP POLICY IF EXISTS "privileged can update user_roles" ON user_roles;
DROP POLICY IF EXISTS "delete user_roles"                ON user_roles;
-- 也清掉 003 留下的舊版（以防名稱重複）
DROP POLICY IF EXISTS "admins can read user_roles"   ON user_roles;
DROP POLICY IF EXISTS "admins can insert user_roles" ON user_roles;
DROP POLICY IF EXISTS "admins can update user_roles" ON user_roles;
DROP POLICY IF EXISTS "admins can delete user_roles" ON user_roles;

CREATE POLICY "admins can read user_roles" ON user_roles
  FOR SELECT USING (is_admin());

CREATE POLICY "admins can insert user_roles" ON user_roles
  FOR INSERT WITH CHECK (is_admin());

CREATE POLICY "admins can update user_roles" ON user_roles
  FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());

-- 刪除：superadmin 可刪任何人；admin 只能刪自己或 editor
CREATE POLICY "admins can delete user_roles" ON user_roles
  FOR DELETE USING (
    is_superadmin()
    OR (
      is_admin()
      AND (email = auth.email() OR role = 'editor')
    )
  );

-- ============================================================
-- 4. 重建 audit_log policy
-- ============================================================
DROP POLICY IF EXISTS "privileged can read audit_log" ON audit_log;
DROP POLICY IF EXISTS "admins can read audit_log"     ON audit_log;

CREATE POLICY "admins can read audit_log" ON audit_log
  FOR SELECT USING (is_admin());

-- ============================================================
-- 5. 重建資料表刪除 policy
-- ============================================================
DROP POLICY IF EXISTS "admins can delete members" ON members;
DROP POLICY IF EXISTS "admins can delete groups"  ON groups;
DROP POLICY IF EXISTS "admins can delete teams"   ON teams;
DROP POLICY IF EXISTS "admins can delete history" ON history;

CREATE POLICY "admins can delete members" ON members
  FOR DELETE USING (is_admin());
CREATE POLICY "admins can delete groups" ON groups
  FOR DELETE USING (is_admin());
CREATE POLICY "admins can delete teams" ON teams
  FOR DELETE USING (is_admin());
CREATE POLICY "admins can delete history" ON history
  FOR DELETE USING (is_admin());
