-- Up Migration
CREATE TABLE eta_snapshots (
  id BIGSERIAL PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  restaurant_name TEXT NOT NULL,
  eta_minutes INTEGER,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX eta_snapshots_restaurant_captured_idx
  ON eta_snapshots (restaurant_id, captured_at);

-- Down Migration
DROP TABLE eta_snapshots;
