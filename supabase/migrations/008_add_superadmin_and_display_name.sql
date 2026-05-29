-- Migration 008: 新增 superadmin 角色 + display_name 欄位

-- 1. 新增 display_name 欄位
ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS display_name text;

-- 2. 更新 role 約束，允許 superadmin
ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
ALTER TABLE user_roles ADD CONSTRAINT user_roles_role_check
  CHECK (role IN ('admin', 'editor', 'superadmin'));

-- 3. 插入系統管理員（已存在則升級為 superadmin）
INSERT INTO user_roles (email, role, display_name)
VALUES ('tuyucheng0407@gmail.com', 'superadmin', '系統管理員')
ON CONFLICT (email) DO UPDATE SET role = 'superadmin', display_name = '系統管理員';

-- 4. 更新 user_roles RLS：讓 superadmin 也能讀取/新增/更新
DROP POLICY IF EXISTS "admins can read user_roles" ON user_roles;
DROP POLICY IF EXISTS "admins can insert user_roles" ON user_roles;
DROP POLICY IF EXISTS "admins can update user_roles" ON user_roles;
DROP POLICY IF EXISTS "admins can delete user_roles" ON user_roles;

CREATE POLICY "privileged can read user_roles" ON user_roles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles WHERE email = auth.email() AND role IN ('admin', 'superadmin'))
  );

CREATE POLICY "privileged can insert user_roles" ON user_roles
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE email = auth.email() AND role IN ('admin', 'superadmin'))
  );

CREATE POLICY "privileged can update user_roles" ON user_roles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM user_roles WHERE email = auth.email() AND role IN ('admin', 'superadmin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE email = auth.email() AND role IN ('admin', 'superadmin'))
  );

-- 刪除權限：
--   superadmin → 可刪除任何人
--   admin      → 只能刪自己或 editor，不能刪其他 admin / superadmin
CREATE POLICY "delete user_roles" ON user_roles
  FOR DELETE USING (
    auth.email() = 'tuyucheng0407@gmail.com'
    OR (
      EXISTS (SELECT 1 FROM user_roles WHERE email = auth.email() AND role = 'admin')
      AND (email = auth.email() OR role = 'editor')
    )
  );

-- 5. 更新 audit_log RLS，讓 superadmin 也能讀取
DROP POLICY IF EXISTS "admins can read audit_log" ON audit_log;
CREATE POLICY "privileged can read audit_log" ON audit_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles WHERE email = auth.email() AND role IN ('admin', 'superadmin'))
  );

-- 6. 更新資料表刪除權限，讓 superadmin 也能刪除
DROP POLICY IF EXISTS "admins can delete members" ON members;
DROP POLICY IF EXISTS "admins can delete groups" ON groups;
DROP POLICY IF EXISTS "admins can delete teams" ON teams;
DROP POLICY IF EXISTS "admins can delete history" ON history;

CREATE POLICY "admins can delete members" ON members
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM user_roles WHERE email = auth.email() AND role IN ('admin', 'superadmin'))
  );
CREATE POLICY "admins can delete groups" ON groups
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM user_roles WHERE email = auth.email() AND role IN ('admin', 'superadmin'))
  );
CREATE POLICY "admins can delete teams" ON teams
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM user_roles WHERE email = auth.email() AND role IN ('admin', 'superadmin'))
  );
CREATE POLICY "admins can delete history" ON history
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM user_roles WHERE email = auth.email() AND role IN ('admin', 'superadmin'))
  );
