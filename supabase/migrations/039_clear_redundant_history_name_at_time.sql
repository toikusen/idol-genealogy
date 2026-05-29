-- Clear "name at time" when it duplicates the member's current name.
-- The application now treats this field as an alias-only override.
update history h
set name_at_time = null
from members m
where h.member_id = m.id
  and h.name_at_time is not null
  and (
    nullif(btrim(h.name_at_time), '') is null
    or (m.name is not null and btrim(h.name_at_time) = btrim(m.name))
  );
