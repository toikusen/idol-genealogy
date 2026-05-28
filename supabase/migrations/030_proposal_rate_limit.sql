-- Rate limit: anonymous users may submit at most 5 proposals per 10 minutes
-- (logged-in users are exempt — submitter_id IS NOT NULL)

CREATE OR REPLACE FUNCTION proposal_rate_limit_ok(p_submitter_name text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COUNT(*) < 5
  FROM proposals
  WHERE submitter_name = p_submitter_name
    AND submitter_id IS NULL          -- only throttle anonymous
    AND created_at > NOW() - INTERVAL '10 minutes';
$$;

-- Drop and recreate the anonymous INSERT policy to include rate limit
DROP POLICY IF EXISTS "Anyone can submit proposals" ON proposals;
DROP POLICY IF EXISTS "allow_proposal_insert" ON proposals;

-- Fallback: drop any insert policy by iterating (safe no-op if already gone)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'proposals' AND cmd = 'INSERT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON proposals', r.policyname);
  END LOOP;
END $$;

-- Re-create INSERT policy with rate limiting
CREATE POLICY "proposals_insert_rate_limited" ON proposals
  FOR INSERT
  WITH CHECK (
    -- Logged-in users: always allowed
    submitter_id IS NOT NULL
    OR
    -- Anonymous users: max 5 per 10 min per name
    proposal_rate_limit_ok(submitter_name)
  );
