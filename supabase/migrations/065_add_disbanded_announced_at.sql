-- Migration 065: Add disbanded_announced_at to groups
-- Tracks when disbanded_at was set so the feed can distinguish
-- "pre-announced future dissolution" from "historical backfill".

ALTER TABLE groups ADD COLUMN IF NOT EXISTS disbanded_announced_at timestamptz;

-- Auto-set disbanded_announced_at whenever disbanded_at is changed.
-- INSERT: set if disbanded_at is provided.
-- UPDATE: set/clear only when disbanded_at actually changes.
CREATE OR REPLACE FUNCTION trg_fn_groups_disbanded_announced_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.disbanded_at IS NOT DISTINCT FROM OLD.disbanded_at THEN
    RETURN NEW;
  END IF;

  IF NEW.disbanded_at IS NULL THEN
    NEW.disbanded_announced_at := NULL;
  ELSE
    NEW.disbanded_announced_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_groups_disbanded_announced_at ON groups;
CREATE TRIGGER trg_groups_disbanded_announced_at
  BEFORE INSERT OR UPDATE ON groups
  FOR EACH ROW EXECUTE FUNCTION trg_fn_groups_disbanded_announced_at();
