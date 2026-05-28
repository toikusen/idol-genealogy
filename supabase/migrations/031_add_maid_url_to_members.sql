-- Add maid_url column to members table
ALTER TABLE members
  ADD COLUMN maid_url TEXT
    CHECK (maid_url IS NULL OR maid_url LIKE 'https://%');
