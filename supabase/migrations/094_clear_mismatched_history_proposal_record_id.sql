-- Migration 093 matched approved INSERT proposals to audit_log rows on
-- name/title. History rows carry neither, so both sides collapsed to NULL and
-- any lone history INSERT within the time window matched. Clear the links that
-- provably point at the wrong row: record_id was NULL before 093 and nothing
-- reads it for history (member/group pages resolve those proposals through
-- proposed_data->>'member_id'), so NULL is the honest value.

UPDATE proposals p
SET record_id = NULL
FROM history h
WHERE h.id = p.record_id
  AND p.table_name = 'history'
  AND p.operation  = 'INSERT'
  AND p.status     = 'approved'
  AND p.proposed_data ? 'member_id'
  AND NULLIF(p.proposed_data ->> 'member_id', '')::uuid IS DISTINCT FROM h.member_id;
