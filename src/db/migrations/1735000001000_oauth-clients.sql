-- Up Migration
CREATE TABLE oauth_clients (
  server TEXT PRIMARY KEY,          -- 'food' | 'im' | 'dineout'
  client_id TEXT NOT NULL,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Down Migration
DROP TABLE oauth_clients;
