-- Allow DELETE proposals (for users to report duplicate/erroneous history entries)
ALTER TABLE proposals
  DROP CONSTRAINT IF EXISTS proposals_operation_check;

ALTER TABLE proposals
  ADD CONSTRAINT proposals_operation_check
    CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE'));
