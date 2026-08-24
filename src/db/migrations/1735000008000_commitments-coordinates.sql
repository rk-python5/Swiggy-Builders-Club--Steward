-- Up Migration
-- get_available_slots/book_table need latitude/longitude directly -- get_saved_locations
-- doesn't return coordinates (by design, for privacy), so address_id alone isn't enough
-- to actually call these tools. Found by testing live against real Dineout tool schemas,
-- not by reading the (already-unreliable) reference doc.
ALTER TABLE commitments ADD COLUMN latitude DOUBLE PRECISION;
ALTER TABLE commitments ADD COLUMN longitude DOUBLE PRECISION;

-- Down Migration
ALTER TABLE commitments DROP COLUMN latitude;
ALTER TABLE commitments DROP COLUMN longitude;
