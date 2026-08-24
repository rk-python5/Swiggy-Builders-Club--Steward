-- Up Migration
-- The action gate's own state: every mutation attempt (both tiers) is recorded here.
-- idempotency_key is the double-order guard -- a retried job with the same key is a no-op.
-- status now includes 'snoozed' (deferred to reappear later), not just accept/reject --
-- this followed directly from the Steward mockup's Approve/Snooze proposal flow (Phase 4),
-- not from the original Phase 1 design.
CREATE TABLE proposals (
  id BIGSERIAL PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  daemon TEXT NOT NULL,               -- 'standing_plans' | 'kitchen_entropy' | 'dead_mans_switch'
  server TEXT NOT NULL,               -- 'food' | 'im' | 'dineout'
  tier TEXT NOT NULL CHECK (tier IN ('A', 'B')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'snoozed', 'executed', 'failed', 'expired')),
  summary TEXT NOT NULL,              -- human-readable, shown in Telegram / the Steward UI
  payload JSONB NOT NULL,             -- the args the eventual MCP tool call will use
  dry_run BOOLEAN NOT NULL DEFAULT false,
  snoozed_until TIMESTAMPTZ,
  result JSONB,                       -- the MCP tool response, once executed
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX proposals_status_idx ON proposals (status);

-- Down Migration
DROP TABLE proposals;
