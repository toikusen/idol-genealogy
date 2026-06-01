-- Add photography/videography policy columns to groups and members tables
ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS photo_status  TEXT CHECK (photo_status  IN ('allowed','not_allowed','conditional')),
  ADD COLUMN IF NOT EXISTS photo_notes   TEXT,
  ADD COLUMN IF NOT EXISTS video_status  TEXT CHECK (video_status  IN ('allowed','not_allowed','conditional')),
  ADD COLUMN IF NOT EXISTS video_notes   TEXT,
  ADD COLUMN IF NOT EXISTS photography_source TEXT;

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS photo_status  TEXT CHECK (photo_status  IN ('allowed','not_allowed','conditional')),
  ADD COLUMN IF NOT EXISTS photo_notes   TEXT,
  ADD COLUMN IF NOT EXISTS video_status  TEXT CHECK (video_status  IN ('allowed','not_allowed','conditional')),
  ADD COLUMN IF NOT EXISTS video_notes   TEXT,
  ADD COLUMN IF NOT EXISTS photography_source TEXT;
