-- Migration 096: give the 42 mislabeled proposals their real submitter name back
-- insert_approved_proposal (and migration 071's backfill) hard-code
-- submitter_name = '管理員', but ordinary users reach that path too — song edits on
-- member/group pages are open to any logged-in user. Their edit-history entries then
-- read '管理員'. Restore the newest real name each user used on their own proposals;
-- users who never submitted under a real name keep '管理員' (nothing to restore).
-- Staff rows and legacy rows without submitter_id are left alone.

UPDATE proposals p
SET submitter_name = COALESCE(
  (
    SELECT p2.submitter_name
    FROM proposals p2
    WHERE p2.submitter_id = p.submitter_id
      AND COALESCE(p2.submitter_name, '') NOT IN ('', '管理員')
    ORDER BY p2.reviewed_at DESC NULLS LAST, p2.created_at DESC
    LIMIT 1
  ),
  p.submitter_name
)
WHERE p.submitter_name = '管理員'
  AND p.submitter_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM auth.users u
    JOIN public.user_roles r ON lower(r.email) = lower(u.email)
    WHERE u.id = p.submitter_id
      AND r.role IN ('editor', 'admin', 'superadmin')
  );
