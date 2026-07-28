-- Approved INSERT proposals were left with record_id = NULL, so the created
-- record's edit-history panel (get_approved_by_record) never found them.
-- Match each one to the audit_log INSERT row it produced, by name/title and
-- approval time. Only unambiguous matches are backfilled.

UPDATE proposals p
SET record_id = m.record_id
FROM (
  -- HAVING below guarantees a single distinct value; min()/max() have no uuid overload.
  SELECT p2.id AS proposal_id, (array_agg(DISTINCT al.record_id))[1] AS record_id
  FROM proposals p2
  JOIN audit_log al
    ON al.table_name = p2.table_name
   AND al.operation  = 'INSERT'
   AND al.created_at BETWEEN p2.reviewed_at - interval '5 minutes'
                         AND p2.reviewed_at + interval '5 minutes'
   AND COALESCE(al.new_data ->> 'name', al.new_data ->> 'title')
       IS NOT DISTINCT FROM
       COALESCE(
         p2.reviewed_data ->> 'name', p2.proposed_data ->> 'name',
         p2.reviewed_data ->> 'title', p2.proposed_data ->> 'title'
       )
  WHERE p2.status = 'approved'
    AND p2.operation = 'INSERT'
    AND p2.record_id IS NULL
    AND p2.reviewed_at IS NOT NULL
  GROUP BY p2.id
  HAVING COUNT(DISTINCT al.record_id) = 1
) m
WHERE p.id = m.proposal_id;
