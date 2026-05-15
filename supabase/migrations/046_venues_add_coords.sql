-- supabase/migrations/046_venues_add_coords.sql
ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS latitude  FLOAT,
  ADD COLUMN IF NOT EXISTS longitude FLOAT;
