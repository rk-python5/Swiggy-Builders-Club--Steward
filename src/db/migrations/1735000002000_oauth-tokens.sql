-- Up Migration
CREATE TABLE oauth_tokens (
  server TEXT PRIMARY KEY,          -- 'food' | 'im' | 'dineout'
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_type TEXT NOT NULL DEFAULT 'Bearer',
  expires_at TIMESTAMPTZ NOT NULL,
  obtained_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Down Migration
DROP TABLE oauth_tokens;
