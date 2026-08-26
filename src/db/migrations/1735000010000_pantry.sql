-- Up Migration
-- Phase 2's world model extension: a depletion BELIEF per item, not an observed fact.
-- Purchases are seen (recorded here); consumption is inferred via a decay curve applied
-- at query time, not stored as a running countdown -- storing a snapshot quantity would
-- silently go stale the moment "now" moves on, so estimated_remaining is always computed
-- fresh from purchased_at + a per-item shelf-life assumption (see src/world/pantry.ts).
CREATE TABLE pantry_items (
  id BIGSERIAL PRIMARY KEY,
  item_name TEXT NOT NULL,             -- e.g. "milk" -- matched loosely against Instamart search results
  quantity NUMERIC NOT NULL,
  unit TEXT NOT NULL,                  -- e.g. "L", "dozen", "kg"
  shelf_life_days NUMERIC NOT NULL,    -- hand-set decay assumption (DECISIONS.md: heuristic now, model later)
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_order_id TEXT                 -- Instamart order id this purchase was observed from, if any
);

CREATE INDEX pantry_items_item_name_purchased_idx ON pantry_items (item_name, purchased_at);

-- Down Migration
DROP TABLE pantry_items;
