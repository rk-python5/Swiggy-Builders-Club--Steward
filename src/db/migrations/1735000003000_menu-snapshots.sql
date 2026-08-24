-- Up Migration
CREATE TABLE menu_snapshots (
  id BIGSERIAL PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  restaurant_name TEXT NOT NULL,
  item_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  price_paise INTEGER NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX menu_snapshots_restaurant_item_captured_idx
  ON menu_snapshots (restaurant_id, item_id, captured_at);

-- Down Migration
DROP TABLE menu_snapshots;
