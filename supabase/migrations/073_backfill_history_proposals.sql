-- Backfill approved proposals for history record edits that exist in audit_log
-- but are missing from the proposals table (due to the null-session / rate-limit bug
-- described in migration 072).
--
-- Logic mirrors recordDirectEdit() in proposal.service.ts:
--   INSERT  → proposed_data = all non-null allowed fields from new_data
--   UPDATE  → proposed_data = changed allowed fields + anchor fields (member_id, group_id)
--             skip if no non-anchor field changed (nothing meaningful to record)
--   DELETE  → proposed_data = anchor fields only (member_id, group_id)
--
-- Uses NULLIF(x, '') to treat null and '' as equivalent, matching the TS string comparison.
-- Deduplicates against existing approved proposals by (record_id, operation, reviewed_at).

WITH allowed AS (
  SELECT unnest(ARRAY[
    'member_id', 'group_id', 'name_at_time',
    'status', 'joined_at', 'left_at',
    'external_group_name', 'external_country',
    'role', 'notes'
  ]::text[]) AS field
),

-- Pull every history audit_log entry
raw AS (
  SELECT
    al.record_id,
    al.operation,
    al.user_id,
    al.created_at        AS reviewed_at,
    al.old_data,
    al.new_data
  FROM audit_log al
  WHERE al.table_name = 'history'
    AND al.operation IN ('INSERT', 'UPDATE', 'DELETE')
),

-- Build proposed_data per operation type
built AS (
  SELECT
    r.record_id,
    r.operation,
    r.user_id,
    r.reviewed_at,
    r.old_data,
    r.new_data,

    CASE r.operation

      WHEN 'INSERT' THEN (
        SELECT jsonb_object_agg(a.field, r.new_data -> a.field)
        FROM   allowed a
        WHERE  NULLIF(r.new_data ->> a.field, '') IS NOT NULL
      )

      WHEN 'DELETE' THEN jsonb_strip_nulls(jsonb_build_object(
        'member_id', COALESCE(r.old_data -> 'member_id', r.new_data -> 'member_id'),
        'group_id',  COALESCE(r.old_data -> 'group_id',  r.new_data -> 'group_id')
      ))

      -- UPDATE: changed allowed fields + always include anchor fields
      ELSE (
        SELECT jsonb_strip_nulls(jsonb_object_agg(
          a.field,
          CASE
            WHEN a.field IN ('member_id', 'group_id')
              THEN COALESCE(r.new_data -> a.field, r.old_data -> a.field)
            ELSE r.new_data -> a.field
          END
        ))
        FROM allowed a
        WHERE
          -- anchors always included
          a.field IN ('member_id', 'group_id')
          -- or changed non-anchor fields
          OR NULLIF(r.old_data ->> a.field, '') IS DISTINCT FROM NULLIF(r.new_data ->> a.field, '')
      )

    END AS proposed_data,

    CASE r.operation

      WHEN 'INSERT' THEN '{}'::jsonb

      WHEN 'DELETE' THEN (
        SELECT jsonb_object_agg(a.field, r.old_data -> a.field)
        FROM   allowed a
        WHERE  NULLIF(r.old_data ->> a.field, '') IS NOT NULL
      )

      ELSE (
        SELECT jsonb_strip_nulls(jsonb_object_agg(
          a.field,
          CASE
            WHEN a.field IN ('member_id', 'group_id')
              THEN COALESCE(r.old_data -> a.field, r.new_data -> a.field)
            ELSE r.old_data -> a.field
          END
        ))
        FROM allowed a
        WHERE
          a.field IN ('member_id', 'group_id')
          OR NULLIF(r.old_data ->> a.field, '') IS DISTINCT FROM NULLIF(r.new_data ->> a.field, '')
      )

    END AS original_data

  FROM raw r
),

-- Filter: skip if proposed_data is empty or only has anchors on an UPDATE
filtered AS (
  SELECT *
  FROM built
  WHERE
    proposed_data IS NOT NULL
    AND proposed_data <> '{}'::jsonb
    -- UPDATE must have at least one non-anchor change
    AND (
      operation <> 'UPDATE'
      OR (proposed_data - 'member_id' - 'group_id') <> '{}'::jsonb
    )
)

INSERT INTO proposals (
  table_name, record_id, operation,
  proposed_data, original_data,
  status, submitter_id, submitter_name,
  reviewed_at, reviewed_by
)
SELECT
  'history',
  f.record_id,
  f.operation,
  f.proposed_data,
  f.original_data,
  'approved',
  f.user_id,
  '管理員',
  f.reviewed_at,
  f.user_id
FROM filtered f
WHERE NOT EXISTS (
  SELECT 1
  FROM proposals p
  WHERE p.table_name = 'history'
    AND p.record_id  = f.record_id
    AND p.operation  = f.operation
    AND p.status     = 'approved'
    AND p.reviewed_at = f.reviewed_at
);
