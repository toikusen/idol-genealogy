-- Backfill approved proposals for member record edits that exist in audit_log
-- but are missing from the proposals table (same null-session / rate-limit bug
-- as described in migration 072, applied to table_name = 'members').
--
-- Mirrors PROPOSAL_ALLOWED_FIELDS['members'] from proposal-fields.config.ts.
-- Deduplicates against existing approved proposals by (record_id, operation, reviewed_at).

WITH allowed AS (
  SELECT unnest(ARRAY[
    'name', 'name_hiragana', 'name_roman', 'emoji', 'nickname', 'birthdate',
    'color', 'color_name', 'instagram', 'facebook', 'x', 'maid_url', 'photo_url',
    'photo_status', 'photo_notes', 'video_status', 'video_notes', 'photography_source'
  ]::text[]) AS field
),

raw AS (
  SELECT
    al.record_id,
    al.operation,
    al.user_id,
    al.created_at AS reviewed_at,
    al.old_data,
    al.new_data
  FROM audit_log al
  WHERE al.table_name = 'members'
    AND al.operation IN ('INSERT', 'UPDATE', 'DELETE')
),

built AS (
  SELECT
    r.record_id,
    r.operation,
    r.user_id,
    r.reviewed_at,

    CASE r.operation
      WHEN 'INSERT' THEN (
        SELECT jsonb_object_agg(a.field, r.new_data -> a.field)
        FROM   allowed a
        WHERE  NULLIF(r.new_data ->> a.field, '') IS NOT NULL
      )
      WHEN 'DELETE' THEN (
        SELECT jsonb_object_agg(a.field, r.old_data -> a.field)
        FROM   allowed a
        WHERE  NULLIF(r.old_data ->> a.field, '') IS NOT NULL
      )
      ELSE (
        SELECT jsonb_strip_nulls(jsonb_object_agg(a.field, r.new_data -> a.field))
        FROM   allowed a
        WHERE  NULLIF(r.old_data ->> a.field, '') IS DISTINCT FROM NULLIF(r.new_data ->> a.field, '')
      )
    END AS proposed_data,

    CASE r.operation
      WHEN 'INSERT' THEN '{}'::jsonb
      WHEN 'DELETE' THEN '{}'::jsonb
      ELSE (
        SELECT jsonb_strip_nulls(jsonb_object_agg(a.field, r.old_data -> a.field))
        FROM   allowed a
        WHERE  NULLIF(r.old_data ->> a.field, '') IS DISTINCT FROM NULLIF(r.new_data ->> a.field, '')
      )
    END AS original_data

  FROM raw r
),

filtered AS (
  SELECT * FROM built
  WHERE proposed_data IS NOT NULL
    AND proposed_data <> '{}'::jsonb
)

INSERT INTO proposals (
  table_name, record_id, operation,
  proposed_data, original_data,
  status, submitter_id, submitter_name,
  reviewed_at, reviewed_by
)
SELECT
  'members',
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
  WHERE p.table_name = 'members'
    AND p.record_id   = f.record_id
    AND p.operation   = f.operation
    AND p.status      = 'approved'
    AND p.reviewed_at = f.reviewed_at
);
