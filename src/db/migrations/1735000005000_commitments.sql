-- Up Migration
-- World model, minimal: recurring social commitments for the Standing Plans daemon.
-- Nothing else (pantry, people, addresses) exists yet — Phase 2/3 add those.
CREATE TABLE commitments (
  id BIGSERIAL PRIMARY KEY,
  label TEXT NOT NULL,               -- e.g. "Friday dinner with Vibhuti"
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday
  time_of_day TIME NOT NULL,
  party_size INTEGER NOT NULL DEFAULT 2,
  cuisine_query TEXT,                 -- passed to search_restaurants_dineout
  address_id TEXT NOT NULL,           -- Dineout-scoped address id (get_saved_locations)
  restaurant_id TEXT,                 -- pinned restaurant, if set; otherwise daemon picks one
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Down Migration
DROP TABLE commitments;
