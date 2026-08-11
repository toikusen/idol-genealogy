-- Migration 100: collapse whitespace in venues.type
--
-- At least one row was entered as "Live\n   House" (newline + indentation),
-- which renders as a broken two-line chip on the new /venue/:id pages. The app
-- also normalizes at read time (venue-address.utils.ts#normalizeVenueType), but
-- the stored value should be clean so admin editing and exports agree.

update venues
set type = regexp_replace(btrim(type), '\s+', ' ', 'g')
where type is not null
  and type <> regexp_replace(btrim(type), '\s+', ' ', 'g');

-- Blank-but-not-null types carry no information; make them null so the UI's
-- "has a type" check is a plain null test.
update venues
set type = null
where type is not null and btrim(type) = '';
