-- Backfill approved proposals for photography policy data set via direct SQL in migration 067.
-- Uses NOT EXISTS to guard against double-insertion if re-run.
-- original_data is empty ({}) since these fields were null before the seed.

INSERT INTO proposals (
  table_name, record_id, operation,
  proposed_data, original_data,
  status, submitter_name,
  reviewed_at
)
SELECT
  'groups',
  g.id,
  'UPDATE',
  jsonb_strip_nulls(jsonb_build_object(
    'photo_status',       g.photo_status::text,
    'photo_notes',        g.photo_notes,
    'video_status',       g.video_status::text,
    'video_notes',        g.video_notes,
    'photography_source', g.photography_source
  )),
  '{}'::jsonb,
  'approved',
  '管理員',
  '2026-06-01T00:00:00Z'::timestamptz
FROM groups g
WHERE g.photography_source = '攝影規範社群討論彙整 · 2026.06'
  AND g.photo_status IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM proposals p
    WHERE p.table_name = 'groups'
      AND p.record_id = g.id
      AND p.status = 'approved'
      AND (p.proposed_data ? 'photo_status' OR p.original_data ? 'photo_status')
  );

INSERT INTO proposals (
  table_name, record_id, operation,
  proposed_data, original_data,
  status, submitter_name,
  reviewed_at
)
SELECT
  'members',
  m.id,
  'UPDATE',
  jsonb_strip_nulls(jsonb_build_object(
    'photo_status',       m.photo_status::text,
    'photo_notes',        m.photo_notes,
    'video_status',       m.video_status::text,
    'video_notes',        m.video_notes,
    'photography_source', m.photography_source
  )),
  '{}'::jsonb,
  'approved',
  '管理員',
  '2026-06-01T00:00:00Z'::timestamptz
FROM members m
WHERE m.photography_source = '攝影規範社群討論彙整 · 2026.06'
  AND m.photo_status IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM proposals p
    WHERE p.table_name = 'members'
      AND p.record_id = m.id
      AND p.status = 'approved'
      AND (p.proposed_data ? 'photo_status' OR p.original_data ? 'photo_status')
  );
