-- Enable RLS on venues and restrict writes to admin/editor only.
-- Regular users propose changes via the proposals table.
alter table venues enable row level security;

-- Public read (needed for the map)
DO $$ BEGIN
  CREATE POLICY "venues are publicly readable" ON venues
    FOR SELECT USING (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Admin writes
DO $$ BEGIN
  CREATE POLICY "admins can insert venues" ON venues
    FOR INSERT WITH CHECK (
      EXISTS (SELECT 1 FROM user_roles WHERE email = auth.email() AND role = 'admin')
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "admins can update venues" ON venues
    FOR UPDATE USING (
      EXISTS (SELECT 1 FROM user_roles WHERE email = auth.email() AND role = 'admin')
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "admins can delete venues" ON venues
    FOR DELETE USING (
      EXISTS (SELECT 1 FROM user_roles WHERE email = auth.email() AND role = 'admin')
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Editor writes
DO $$ BEGIN
  CREATE POLICY "editors can insert venues" ON venues
    FOR INSERT WITH CHECK (
      EXISTS (SELECT 1 FROM user_roles WHERE email = auth.email() AND role = 'editor')
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "editors can update venues" ON venues
    FOR UPDATE USING (
      EXISTS (SELECT 1 FROM user_roles WHERE email = auth.email() AND role = 'editor')
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
