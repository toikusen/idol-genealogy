-- 049 created the venues admin policies with role = 'admin' only, unlike every
-- other table which uses role IN ('admin', 'superadmin'). Recreate them so
-- superadmins can manage venues too.

DROP POLICY IF EXISTS "admins can insert venues" ON venues;
CREATE POLICY "admins can insert venues" ON venues
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE email = auth.email() AND role IN ('admin', 'superadmin'))
  );

DROP POLICY IF EXISTS "admins can update venues" ON venues;
CREATE POLICY "admins can update venues" ON venues
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM user_roles WHERE email = auth.email() AND role IN ('admin', 'superadmin'))
  );

DROP POLICY IF EXISTS "admins can delete venues" ON venues;
CREATE POLICY "admins can delete venues" ON venues
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM user_roles WHERE email = auth.email() AND role IN ('admin', 'superadmin'))
  );
