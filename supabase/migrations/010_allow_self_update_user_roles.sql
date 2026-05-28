-- Migration 010: 允許所有登入用戶讀取及更新自己的 profile
-- 限制：自我更新不得變更 role（由 WITH CHECK 強制）

-- 允許用戶讀取自己的 row
CREATE POLICY "users can read own profile" ON user_roles
  FOR SELECT
  USING (email = auth.email());

-- 取得目前用戶的 role（SECURITY DEFINER 繞過 RLS）
CREATE OR REPLACE FUNCTION public.get_own_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM public.user_roles WHERE email = auth.email();
$$;

-- 新增自我更新 policy（不能改 role，只能改 display_name 等）
CREATE POLICY "users can update own profile" ON user_roles
  FOR UPDATE
  USING (email = auth.email())
  WITH CHECK (email = auth.email() AND role = get_own_role());
