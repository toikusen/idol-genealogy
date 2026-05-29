-- Allow group_id to be NULL for external (overseas) career records
ALTER TABLE history ALTER COLUMN group_id DROP NOT NULL;

-- Add external career fields
ALTER TABLE history
  ADD COLUMN IF NOT EXISTS external_group_name text,
  ADD COLUMN IF NOT EXISTS external_country    text;

-- Constraint: must have either group_id or external_group_name
ALTER TABLE history
  ADD CONSTRAINT history_has_group_or_external
  CHECK (group_id IS NOT NULL OR external_group_name IS NOT NULL);
