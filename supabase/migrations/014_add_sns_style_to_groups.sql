ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS style     text,
  ADD COLUMN IF NOT EXISTS instagram text,
  ADD COLUMN IF NOT EXISTS facebook  text,
  ADD COLUMN IF NOT EXISTS x         text,
  ADD COLUMN IF NOT EXISTS youtube   text;
