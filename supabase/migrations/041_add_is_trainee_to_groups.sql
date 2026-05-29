ALTER TABLE groups ADD COLUMN is_trainee boolean NOT NULL DEFAULT false;

-- Migrate existing data: groups with notes containing the old convention
UPDATE groups SET is_trainee = true WHERE notes LIKE '%類型：研修・見習%';
