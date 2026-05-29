ALTER TABLE members
  ALTER COLUMN birthdate TYPE text USING TO_CHAR(birthdate, 'MM-DD');
