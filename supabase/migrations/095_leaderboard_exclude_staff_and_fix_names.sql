-- Migration 095: contributor leaderboard — drop staff, stop showing '管理員' as a name
-- 1. Staff direct edits go through insert_approved_proposal, so editor/admin/superadmin
--    accounts pile up approved proposals and outrank real community contributors.
-- 2. Migration 071's backfill hard-coded submitter_name = '管理員' on rows whose
--    submitter_id is an ordinary user. Those rows have the newest reviewed_at, so the
--    "latest name wins" lookup replaced real names with '管理員'. Skip that literal and
--    fall back to the newest real name from any proposal (pending ones included).

CREATE OR REPLACE FUNCTION get_leaderboard()
RETURNS TABLE (
  submitter_id   uuid,
  submitter_name text,
  total          bigint,
  by_table       jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT
    sub.submitter_id,
    COALESCE(
      (
        SELECT p2.submitter_name
        FROM proposals p2
        WHERE p2.submitter_id = sub.submitter_id
          AND COALESCE(p2.submitter_name, '') NOT IN ('', '管理員')
        ORDER BY p2.reviewed_at DESC NULLS LAST, p2.created_at DESC
        LIMIT 1
      ),
      '匿名貢獻者'
    ) AS submitter_name,
    SUM(sub.cnt)::bigint AS total,
    jsonb_object_agg(sub.table_name, sub.cnt ORDER BY sub.table_name) AS by_table
  FROM (
    SELECT
      p.submitter_id,
      p.table_name,
      COUNT(*) AS cnt
    FROM proposals p
    WHERE p.status = 'approved'
      AND p.submitter_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM auth.users u
        JOIN public.user_roles r ON lower(r.email) = lower(u.email)
        WHERE u.id = p.submitter_id
          AND r.role IN ('editor', 'admin', 'superadmin')
      )
    GROUP BY p.submitter_id, p.table_name
  ) sub
  GROUP BY sub.submitter_id
  ORDER BY total DESC, sub.submitter_id ASC;
$$;
