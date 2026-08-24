import { pool } from "./pool.js";

export type SwiggyServer = "food" | "im" | "dineout";

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in: number; // seconds
}

export interface StoredToken {
  accessToken: string;
  refreshToken: string | null;
  tokenType: string;
  expiresAt: Date;
}

export async function saveToken(server: SwiggyServer, token: TokenResponse): Promise<void> {
  const expiresAt = new Date(Date.now() + token.expires_in * 1000);
  await pool.query(
    `INSERT INTO oauth_tokens (server, access_token, refresh_token, token_type, expires_at, obtained_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (server) DO UPDATE SET
       access_token = EXCLUDED.access_token,
       refresh_token = EXCLUDED.refresh_token,
       token_type = EXCLUDED.token_type,
       expires_at = EXCLUDED.expires_at,
       obtained_at = now()`,
    [server, token.access_token, token.refresh_token ?? null, token.token_type ?? "Bearer", expiresAt],
  );
}

export async function loadToken(server: SwiggyServer): Promise<StoredToken | null> {
  const { rows } = await pool.query(
    `SELECT access_token, refresh_token, token_type, expires_at
     FROM oauth_tokens WHERE server = $1`,
    [server],
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    tokenType: row.token_type,
    expiresAt: new Date(row.expires_at),
  };
}

export async function getClientId(server: SwiggyServer): Promise<string | null> {
  const { rows } = await pool.query(`SELECT client_id FROM oauth_clients WHERE server = $1`, [server]);
  return rows[0]?.client_id ?? null;
}

export async function saveClientId(server: SwiggyServer, clientId: string): Promise<void> {
  await pool.query(
    `INSERT INTO oauth_clients (server, client_id, registered_at)
     VALUES ($1, $2, now())
     ON CONFLICT (server) DO UPDATE SET client_id = EXCLUDED.client_id, registered_at = now()`,
    [server, clientId],
  );
}
