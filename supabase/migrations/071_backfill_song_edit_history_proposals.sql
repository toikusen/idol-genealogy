-- Backfill approved proposals for member/group original-song edits captured in audit_log.
-- This can only restore song history after migration 062 added song audit triggers.
-- Soft deletes are stored as UPDATE is_deleted=false -> true and are represented as DELETE proposals.

WITH normalized AS (
  SELECT
    al.id AS audit_log_id,
    al.table_name,
    al.record_id,
    CASE
      WHEN al.operation = 'UPDATE'
        AND COALESCE((al.old_data ->> 'is_deleted')::boolean, false) = false
        AND COALESCE((al.new_data ->> 'is_deleted')::boolean, false) = true
        THEN 'DELETE'
      ELSE al.operation
    END AS operation,
    al.user_id,
    al.created_at AS reviewed_at,
    al.old_data,
    al.new_data
  FROM audit_log al
  WHERE al.table_name IN ('member_songs', 'group_songs')
    AND al.operation IN ('INSERT', 'UPDATE', 'DELETE')
),
proposal_rows AS (
  SELECT
    table_name,
    record_id,
    operation,
    CASE
      WHEN operation = 'DELETE' THEN
        jsonb_strip_nulls(jsonb_build_object(
          CASE WHEN table_name = 'member_songs' THEN 'member_id' ELSE 'group_id' END,
          CASE WHEN table_name = 'member_songs'
            THEN COALESCE(old_data -> 'member_id', new_data -> 'member_id')
            ELSE COALESCE(old_data -> 'group_id', new_data -> 'group_id')
          END
        ))
      ELSE
        jsonb_strip_nulls(jsonb_build_object(
          CASE WHEN table_name = 'member_songs' THEN 'member_id' ELSE 'group_id' END,
          CASE WHEN table_name = 'member_songs'
            THEN new_data -> 'member_id'
            ELSE new_data -> 'group_id'
          END,
          'title',        new_data -> 'title',
          'release_date', new_data -> 'release_date',
          'youtube_url',  new_data -> 'youtube_url',
          'composer',     new_data -> 'composer',
          'lyricist',     new_data -> 'lyricist',
          'arranger',     new_data -> 'arranger',
          'notes',        new_data -> 'notes',
          'sort_order',   new_data -> 'sort_order'
        ))
    END AS proposed_data,
    CASE
      WHEN operation = 'INSERT' THEN '{}'::jsonb
      ELSE
        jsonb_strip_nulls(jsonb_build_object(
          CASE WHEN table_name = 'member_songs' THEN 'member_id' ELSE 'group_id' END,
          CASE WHEN table_name = 'member_songs'
            THEN old_data -> 'member_id'
            ELSE old_data -> 'group_id'
          END,
          'title',        old_data -> 'title',
          'release_date', old_data -> 'release_date',
          'youtube_url',  old_data -> 'youtube_url',
          'composer',     old_data -> 'composer',
          'lyricist',     old_data -> 'lyricist',
          'arranger',     old_data -> 'arranger',
          'notes',        old_data -> 'notes',
          'sort_order',   old_data -> 'sort_order'
        ))
    END AS original_data,
    user_id,
    reviewed_at,
    old_data,
    new_data
  FROM normalized
  WHERE operation IN ('INSERT', 'UPDATE', 'DELETE')
    AND (
      operation <> 'UPDATE'
      OR (old_data ->> 'title')        IS DISTINCT FROM (new_data ->> 'title')
      OR (old_data ->> 'release_date') IS DISTINCT FROM (new_data ->> 'release_date')
      OR (old_data ->> 'youtube_url')  IS DISTINCT FROM (new_data ->> 'youtube_url')
      OR (old_data ->> 'composer')     IS DISTINCT FROM (new_data ->> 'composer')
      OR (old_data ->> 'lyricist')     IS DISTINCT FROM (new_data ->> 'lyricist')
      OR (old_data ->> 'arranger')     IS DISTINCT FROM (new_data ->> 'arranger')
      OR (old_data ->> 'notes')        IS DISTINCT FROM (new_data ->> 'notes')
      OR (old_data ->> 'sort_order')   IS DISTINCT FROM (new_data ->> 'sort_order')
    )
)
INSERT INTO proposals (
  table_name, record_id, operation,
  proposed_data, original_data,
  status, submitter_id, submitter_name,
  reviewed_at, reviewed_by
)
SELECT
  pr.table_name,
  pr.record_id,
  pr.operation,
  pr.proposed_data,
  pr.original_data,
  'approved',
  pr.user_id,
  '管理員',
  pr.reviewed_at,
  pr.user_id
FROM proposal_rows pr
WHERE NOT EXISTS (
  SELECT 1
  FROM proposals p
  WHERE p.table_name = pr.table_name
    AND p.record_id = pr.record_id
    AND p.operation = pr.operation
    AND p.status = 'approved'
    AND p.reviewed_at = pr.reviewed_at
);
