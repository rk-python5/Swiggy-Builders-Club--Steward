-- Up Migration
-- Scheduler run history -- proves the spine survives a restart and that retries are visible,
-- not just silently absorbed by the idempotency key.
CREATE TABLE daemon_runs (
  id BIGSERIAL PRIMARY KEY,
  daemon TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'failed')),
  detail TEXT
);

CREATE INDEX daemon_runs_daemon_started_idx ON daemon_runs (daemon, started_at);

-- Down Migration
DROP TABLE daemon_runs;
